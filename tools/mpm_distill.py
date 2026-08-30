#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MPM 程序性记忆蒸馏器（P023 · 云端微调路径第一步）

把飞轮台账 (.mpm/flywheel.json) 的事件轨迹转成智谱云端微调 API 的 JSONL 训练对。
定位（P023 第 4 次界定）：程序性记忆小脑器官——教的不是事实记忆，而是
"给定飞轮状态，该执行哪个 MPM 动作"的工具选择与排序程序。

轨迹→训练对映射（v1）：
  system    = MPM 方法论与宪法约束摘要（全对固定，可用 --system 覆写）
  user      = 事件 t 之前该题的压缩状态（题面/阶段/δ/ε/最近动作）
  assistant = 事件 t 实际发生的动作，表述为标准工具调用意图 JSON

诚实边界（不伪造数据）：
  1. 行为克隆只学"做过什么"，不学"做得对不对"；
  2. 导师规则判为 δ 失真的题（deltaIncidents>0）其"因果回溯"事件默认剔除
     （--keep-incidents 可保留）；
  3. δ/ε 为台账终值而非逐时刻值（台账未存历史序列），user 侧如实标注"终值口径"；
  4. D 阶沉积语义内容不入训练对——那是事实记忆，小脑只要程序。

用法：
  python mpm_distill.py [--state .mpm/flywheel.json] [--out distill_pairs.jsonl]
                        [--min-events 2] [--max-pairs 300] [--system FILE]
输出：JSONL（每行 {"messages":[system,user,assistant]}）+ stderr 统计摘要。
"""
import argparse
import json
import sys

TOOL_OF_VERB = {
    "G": "mpm_generate",
    "F": "mpm_frame",
    "S": "mpm_solve",
    "C": "mpm_converge",
    "D": "mpm_deposit",
    "E": "mpm_evoke",
}

DEFAULT_SYSTEM = (
    "你是 MPM 元问题建模运行时的个体大脑。问题有六阶段生命周期 "
    "G生成→F界定→S求解→C收敛→D沉积→E激发，对应工具 mpm_generate/mpm_frame/"
    "mpm_solve/mpm_converge/mpm_deposit/mpm_evoke（另有 mpm_micro 轻量通道、"
    "mpm_setroot 维护、mpm_grant 执政权）。总账原则：每次交互必须可归账。"
    "收到飞轮状态后，输出下一个应执行的动作 JSON：{\"action\":工具名,"
    "\"problemId\":题号, 其余关键字段按动作语义给出}。只输出 JSON。"
)


def classify(event):
    """事件名 → (动作动词, 子类)。前缀匹配，容忍引擎事件措辞演化。"""
    e = str(event or "")
    for v in ("G", "F", "S", "C", "D", "E"):
        if e.startswith(v + " "):
            sub = "micro" if "微通道" in e else ""
            sub = "reentry" if "回溯" in e else sub
            sub = "park" if "PARKED" in e else sub
            sub = "unpark" if "UNPARKED" in e else sub
            return v, sub
    return None, None


def assistant_payload(verb, sub, pid, note):
    act = TOOL_OF_VERB[verb]
    o = {"action": act, "problemId": pid}
    if act == "mpm_solve":
        if sub == "park":
            o["parked"] = True
        elif sub == "unpark":
            o["parked"] = False
    if note:
        o["summary"] = note[:120]
    return o


def state_line(p, prev_events):
    verbs = []
    for h in prev_events[-3:]:
        v, _ = classify(h.get("event"))
        if v:
            verbs.append(v)
    return (
        "【飞轮状态·终值口径】在轮题【%s】%s｜阶段:%s｜δ=%s ε=%s｜最近动作:%s"
        % (
            p.get("id"),
            str(p.get("title", ""))[:40],
            p.get("stage", "?"),
            p.get("delta", "—"),
            p.get("epsilon", "—"),
            "→".join(verbs) if verbs else "无",
        )
    )


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="MPM 台账→微调 JSONL 蒸馏器")
    ap.add_argument("--state", default=".mpm/flywheel.json")
    ap.add_argument("--out", default="distill_pairs.jsonl")
    ap.add_argument("--min-events", type=int, default=2)
    ap.add_argument("--max-pairs", type=int, default=300)
    ap.add_argument("--system", default="", help="系统提示文本文件（覆写默认）")
    ap.add_argument("--keep-incidents", action="store_true",
                    help="保留 δ 失真题的回溯事件（默认剔除）")
    args = ap.parse_args()

    system_text = DEFAULT_SYSTEM
    if args.system:
        with open(args.system, "r", encoding="utf-8-sig") as f:
            system_text = f.read().strip() or DEFAULT_SYSTEM

    with open(args.state, "r", encoding="utf-8") as f:
        data = json.load(f)

    problems = data.get("problems", {})
    pairs, used = [], set()
    skipped = {"short_history": 0, "incident": 0, "unknown_event": 0}
    for pid in sorted(problems.keys()):
        p = problems[pid]
        hist = p.get("history") or []
        if len(hist) < args.min_events:
            skipped["short_history"] += 1
            continue
        incident = (p.get("deltaIncidents") or 0) > 0
        for i in range(1, len(hist)):
            h = hist[i]
            verb, sub = classify(h.get("event"))
            if not verb:
                skipped["unknown_event"] += 1
                continue
            if (sub == "reentry" and incident and not args.keep_incidents):
                skipped["incident"] += 1
                continue
            note = str(h.get("note", "")).strip()
            user_text = state_line(p, hist[:i])
            asst = json.dumps(
                assistant_payload(verb, sub, pid, note), ensure_ascii=False
            )
            pairs.append({
                "messages": [
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": user_text},
                    {"role": "assistant", "content": asst},
                ]
            })
            used.add(pid)

    pairs = pairs[: args.max_pairs]
    with open(args.out, "w", encoding="utf-8") as f:
        for r in pairs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    stats = {
        "problems_total": len(problems),
        "problems_used": len(used),
        "pairs": len(pairs),
        "skipped": skipped,
        "out": args.out,
    }
    print(json.dumps(stats, ensure_ascii=False))
    if pairs:
        sample = pairs[0]["messages"]
        print("样本 user   :", sample[1]["content"])
        print("样本 assist.:", sample[2]["content"])


if __name__ == "__main__":
    main()
