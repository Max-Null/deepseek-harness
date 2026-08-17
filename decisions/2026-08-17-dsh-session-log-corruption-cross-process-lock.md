# 2026-08-17 DSH会话日志损坏-跨进程锁修复决策

## 背景与问题

Web GUI 报错：

```
history unavailable for session "session-353b45ea-0258-4589-9835-c6cd836c298e":
Error: corrupt session log: seq gap in committed region at line 78061 (expected 1031542, got 1031541)
```

### 诊断结论（对损坏文件逐帧解码分析）

- 文件为 zstd 分帧 JSONL，75659 帧，共 1213372 个事件，**全文件仅 1 处 seq 异常**。
- 现场：`turn/end`(seq 1031540, 00:45:17) → `session/end-seed`(seq 1031541, 00:45:40，独立一帧) → `agent/inbox/spliced`(seq 1031541, 00:46:15) → `turn/start`(1031542)…此后全部连续。
- 根因：**两个 DSH 进程并发写同一会话日志**。进程 W（Web 主机，会话一直存活）在 00:46 写入用户新消息（splice 1031541 + turn 125 全部事件）；进程 C 在 00:45:40 对同一会话做了冷恢复，把 `session/end-seed`(1031541) 写入同一文件。W 的 splice 拿到的 seq 是 W 内存日志长度 1031541，与 C 写入的 end-seed seq 撞车。
- 为什么能撞车：`Session.append` 的 seq = 本进程内存日志长度；JSONL 后端 append 时的连续性校验（`appendCore`）只对**本进程内存游标**校验，磁盘上被别的进程追加的内容完全不可见。SQLite 后端因 `PRIMARY KEY(session_id, seq)` 会在第二次插入时响亮失败，JSONL 没有等价防线。
- 触发条件（用户实际场景）：用户在 Web GUI（主实例）里开着这个会话工作，同时起过另一个 DSH 实例并打开了同一会话（00:45:40 那次冷恢复），两个实例写同一个 `$DSH_HOME/sessions` 根目录。

### 修复方案（决策）

三层动作：

1. **数据修复（本次执行）**：删除第 62797 帧（只含那条多余的 `session/end-seed` 行）。删除后全文件 0..1213371 完全连续，所有后续 seq 本来就是按 W 的连续编号写的，一个字节都不用改。原文件先备份。这是唯一正确且零信息损失的修复方式（重新编号 18 万事件的 seq 会牵动 packed rows 的 seq0 和所有 sourceEventSeqs 引用，不可行）。
2. **根因修复（DSH 仓库代码）**：给 JSONL 后端加**跨进程会话写锁**，见下文设计。
3. **防复发机制说明**：加锁后，第二个实例冷恢复正在被他人持有的会话时，会在写入 end-seed 前**响亮失败**（"session X is open in another process (pid N)…"），而不是静默把日志写坏。用户关掉另一个实例即可继续。

### 锁设计（跨进程、进程死亡自动释放）

- 锁文件：`<session 目录>/session.lock`。
- **Windows**：koffi 调 `CreateFileW`，`dwShareMode = FILE_SHARE_READ`（允许他人读 pid 作诊断，拒绝他人写/删），`OPEN_ALWAYS`。持有句柄期间其他进程任何写打开都得到 `ERROR_SHARING_VIOLATION(32)` → 判定忙。锁文件里写 `pid`。进程崩溃时句柄随进程关闭，锁自动释放，无陈旧锁问题。
- **POSIX**：koffi 调 libc `flock(LOCK_EX | LOCK_NB)`，`EAGAIN` → 忙。进程死亡自动释放。锁文件保留不删（避免 unlink+重开导致双持有者的经典竞态），下次 flock 同一 inode。
- 获取时机：`appendBatch`（含 materialize）首次写入前获取并**持有**；`commitRepair`（截断+补全）在自身未持有时临时获取、修完即放。跨进程互斥 ⇒ seq 撞车在写入前就被拒绝，**永不静默损坏**。
- 释放时机：coordinator `retireCore` 调新增的后端钩子 `releaseSession(id)`；后端 `close()` 兜底释放全部。
- 读路径不加锁（延续现有"容忍外部写者 + revision 重试"的读语义）。
- 归属判定：SQLite 后端已有主键防线，本锁只在 JSONL 后端实现；钩子挂在 `PersistenceBackend` 接口上但由 JSONL 后端实现。

### 放弃的方案

- **写前 size 校验（compare-and-append）**：能把损坏窗口缩小到 stat→write 之间，但残留 TOCTOU 竞态，且治标不治本 → 否。
- **`wx` 创建式锁文件**（沿用 atomic-write 的 `withFileLock`）：进程崩溃后锁文件残留，恢复会话变成"操作员手工删锁"，与后端"崩溃自愈（torn tail 自动修复）"的设计哲学冲突 → 否。
- **全局根目录锁（一次只允许一个实例写整个 sessions 根）**：把"同根不同会话"的合法并发（GUI 主机 + headless 各自新会话）也禁掉 → 否。

### 遗留

- 两个实例**同时**读同一会话没问题；同一会话的跨进程写已被锁拒绝。跨进程"自动接管"（另一个实例等待锁释放后接管会话）仍是远期议题，本次不做。

## 决策记录

- 采用：删除多余 end-seed 帧修数据 + JSONL 后端 OS 级跨进程会话锁（koffi，Windows 共享模式 / POSIX flock，进程死亡自动释放）。
- 相关 DSH 仓库改动：`packages/session/session-persistence-jsonl/src/lock.ts`（新）、`index.ts` 集成、`PersistenceBackend.releaseSession` 钩子 + coordinator `retireCore` 调用、测试与 Agent Note（`implemented/bug-fix/2026-08-17-jsonl-session-log-cross-process-lock.md`）。
