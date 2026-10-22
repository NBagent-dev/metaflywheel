# MPM paper v2 (theory document)

**English** · [简体中文](theory.zh-CN.md)

> Status: v2 draft, awaiting author sign-off. This file is the theoretical baseline of the MetaFlywheel engine implementation.

# Meta-Problem Modeling: Problem Lifecycle, Approximation Theory and the Cognitive Flywheel (v2)

## — a unified framework from system entropy reduction to cognitive evolution, with its implementation and evidence in an LLM agent runtime

**Version note**: v2 completes three levels of revision over v1 — level A (hard revisions: replacement of equation (4), runtime semantics in §5.4 and §4.6), all bound to runtime evidence; level B (two new chapters: chapter 6 on normative enforcement machinery and chapter 7 on measurement methodology v0); level C (the self-reference test expanded, references completed). The axiomatic skeleton (chapter 3) is unchanged: the three axioms survived runtime testing over 30 problems, 19 deposits and 32 patrol rounds.

**Abstract**: Classical problem-solving theory focuses on the search process after a problem has been given, and lacks a unified framework for the generation, framing, evolution and regeneration of problems themselves. This paper proposes Meta-Problem Modeling (MPM), which treats a problem as a dynamic system with a lifecycle and constructs a cognitive-flywheel model of six stages: generation, framing, solving, convergence, deposition and evocation. MPM rests on three axioms — subject-object duality, entropy reduction, and approximation — introduces a dual ε-δ convergence criterion, explains the re-framing of problems during solving through "causal re-entry", and achieves a cognitive spiral through deposition and evocation. The two main extensions in v2 come from the framework's own implementation inside an LLM agent runtime (a working ledger of 30 problems, 19 deposits and 32 patrol rounds). First, **normative enforcement machinery**: adherence to a methodology cannot rest on the subject's self-discipline or on hoping a prompt works; it must rest on gate design that makes violation structurally unprofitable — an engineering answer to the long-standing descriptive/normative tension. Second, **measurement methodology v0**: a proxy-indicator system for δ and ε, an operational definition of cumulative gain (including the measured lesson that the original formula was structurally zero), and the meta-insight that measurement indicators themselves have a lifecycle. The theory is still validated by three cross-domain cases, and closes with a self-referential loop carrying a complete metabolic ledger: the iteration of this paper is itself driven by the framework's evocation mechanism.

**Keywords**: meta-problem modeling; problem lifecycle; approximation theory; cognitive flywheel; causal re-entry; normative enforcement machinery; free energy principle

---

## 1 Introduction

### 1.1 Background and problem statement

Since Newell and Simon published *Human Problem Solving* in 1972, problem solving has been a core paradigm of cognitive science, artificial intelligence and operations research. Classical theory defines a problem as a triple of initial state, goal state and operator set, and studies how to search an effective path inside a given problem space. That paradigm succeeded enormously on well-structured problems, but exposes a fundamental defect on complex problems such as social policy, organisational management and AI safety: the initial state, the goal state and even the boundary of the problem are themselves vague and contested, and keep evolving while the problem is being solved.

Rittel and Webber (1973) named such problems "wicked"; Checkland's (1981) soft systems methodology further argued that "systemic" is a property of the human process of inquiry rather than of the world itself. These insights challenge the default assumption that a problem exists before its solving, but they do not yet provide a formal framework unifying the generation, framing, solving, convergence and regeneration of problems.

The gap has become more urgent at the frontier of AI. In 2025 DeepSeek-R1 demonstrated long-chain reasoning bootstrapped by pure reinforcement learning; in 2026 the OpenRSI framework pushed recursive self-improvement (RSI) from philosophical discussion to the experimental frontier. In such systems the problem is no longer given from outside: it is generated, evaluated and iterated by the system itself, so the problem's lifecycle is deeply coupled with the system's cognitive process.

v2 adds a reverse pressure from practice. When MPM is implemented as a resident runtime inside an LLM agent (a cognitive engine mounted on a host process through a composition line, with nine lifecycle tools, a resident patrol loop and an autonomous deliberation mechanism), the theory immediately meets two questions v1 did not handle: **how a descriptive theory can be enforced** (chapter 6), and **how the theory's core quantities can be measured at all, and without self-deception** (chapter 7). Neither is an engineering detail: the first is an engineering answer to the descriptive/normative tension inherited from Checkland, and the second reveals how a measurement gap can disguise itself as the theory's silence.

### 1.2 Core claims

**Dynamism**: a problem is not a static object but a dynamic process with a lifecycle; the six stages form an ascending spiral, the cognitive flywheel.

**Approximation**: problem solving follows approximation-theoretic logic, with two parameters: δ (precision of the problem definition) and ε (precision of the solution's approximation).

**Entropy drive**: the lifecycle is driven by the coupling of system entropy reduction and cognitive convergence, isomorphic to the active-inference mechanism of the free energy principle.

**Circularity**: convergence is not the endpoint; deposition and evocation produce accumulation across generations.

**Executability (new in v2)**: every component above — lifecycle, criteria, re-entry, gates, measurement — can be implemented inside an LLM agent runtime as executable constraints and tools, and the implementation itself constitutes a loop of testing and revision for the theory. The theory is no longer only descriptive: it is a normative system that runs, can be falsified, and can be fed back into by its own implementation.

### 1.3 Structure

Chapter 2 reviews the theoretical background; chapter 3 states three axioms; chapter 4 presents the six-stage flywheel model (including the evidence-driven revision of equation (4)); chapter 5 establishes the ε-δ convergence criterion and its runtime semantics; chapter 6 proposes the normative enforcement machinery (new in v2); chapter 7 gives measurement methodology v0 (new in v2); chapter 8 validates the framework on four cases; chapter 9 discusses scope and the self-reference test; chapter 10 concludes.

## 2 Theoretical background and dialogue with the literature

### 2.1 Classical problem solving: bounded rationality and the problem space

Simon's (1955) theory of bounded rationality holds that a decision maker is constrained by cognitive capacity, information and time, and therefore settles for "good enough". Newell and Simon (1972) formalised problem solving as search in a problem space. That theory carries an implicit premise: the problem space is sufficiently framed before solving begins. MPM makes the premise explicit and folds the construction, correction and re-construction of the problem space into a single lifecycle framework.

### 2.2 Wicked problems and soft systems methodology

The central insight of Rittel and Webber (1973) is that "what the problem is" is itself a core issue of solving. Checkland (1981) promotes collective learning through iterations of root definition and conceptual model, but the tension between his normative claim (how inquiry ought to proceed) and descriptive reality (how it actually proceeds) remains unresolved in that framework. Chapter 6 of MPM v2 gives an engineering answer to that tension: normativity is enforced not through argument but through structural constraint.

### 2.3 The free energy principle and active inference

Friston's (2010) free energy principle holds that a self-organising system maintains itself by minimising variational free energy; perception and action are unified as active inference (Friston et al., 2016). Perception (updating the internal model to match input) corresponds to MPM's framing, and action (changing input to match prediction) to its solving. The mechanism beneath "causal re-entry" is exactly this: action changes sensory input, and new input requires an updated model — the problem is continuously re-framed while it is being solved.

### 2.4 Mathematical basis in approximation theory

The Weierstrass (1885) and Stone–Weierstrass theorems supply MPM's mathematical metaphor: the objective problem situation is analogous to the function to be approximated, the subjective representation to the approximating polynomial, and δ to the approximation error. One measured lesson in v2 comes from the reverse side of measurement (§7.5): when the **measure of the approximation error is itself ill-defined**, approximation can look "perfect" on the indicator (gain identically zero) while actually stagnating — a defective measure is a special and well-hidden form of framing distortion.

### 2.5 Boundary constraints from logic and games

Gödel's incompleteness theorems show that some problems have no convergent solution in principle; PPAD-completeness (Daskalakis et al., 2009) supplies a computational-complexity boundary for multi-agent problems. MPM gives runtime counterparts for both boundaries (§5.4): the former is marked "permanently open" and shifted to situation management, the latter is handled by dimensional reduction — and both exist in the runtime as explicit states rather than as silent defaults.

### 2.6 Theoretical increment

MPM does not replace existing theory but integrates and extends it at the meta level: framing is upgraded from a preliminary step of solving to a core dynamic running through the whole cycle; the lifecycle gains axioms, criteria and cross-domain explanatory power; and v2 adds two increments — an enforcement theory of normativity, and a measurement methodology for the core quantities.

## 3 Axiomatic basis of meta-problem modeling

### 3.1 Axiom one: subject-object duality of a problem

**Statement**: every problem P has both an objective and a subjective dimension. The objective dimension is the problem situation X_obj, independent of the cognitive subject; the subjective dimension is the subject's representation Y_sub of that situation. The problem P is the representational relation between them:

**P = ⟨X_obj, Y_sub, R⟩** (1)

where R ⊆ X_obj × Y_sub is the representational mapping between subject and object, and R need not be a perfect isomorphism.

**Argument**: if a problem had only an objective dimension, the same situation would present itself as the same problem to every subject, contrary to fact; if it had only a subjective dimension, "misunderstanding the problem" would be impossible, also contrary to fact.

**Corollary 1.1 (fallibility)**: R is biased, so the subjective representation can depart from the objective situation — the root of "misreading the problem".

**Corollary 1.2 (intersubjectivity)**: different subjects can form different representations of the same situation; one core task of multi-agent solving is to reconcile representational differences.

### 3.2 Axiom two: entropy reduction in the problem space

**Statement**: the appearance of a problem corresponds to a step increase in the information entropy of the cognitive system; the problem's lifecycle is the process by which the system reduces that entropy through modelling and action; convergence corresponds to the system reaching a locally stable low-entropy state.

Formally, let S(t) be the system's information entropy about the problem situation at time t, and θ the entropy-increase threshold. The generation time t₀ satisfies ΔS = S(t₀) − S(t₀⁻) > θ; the convergence time t_c satisfies S(t_c) < ε_S and dS/dt|_{t_c} ≈ 0.

**Corollary 2.1 (energy cost)**: entropy reduction in a local system must be paid for by a larger entropy increase in its environment, manifesting as consumption of cognitive, computational and material resources (runtime counterpart: automatic accumulation of the metabolic cost C, see §7.2).

**Corollary 2.2 (satisficing rather than optimal)**: convergence requires only a locally stable low-entropy state, matching Simon's satisficing principle.

### 3.3 Axiom three: approximation in problem evolution

**Statement**: problem solving is progressive approximation of the "true problem situation". The subjective representation at iteration k, Y_sub⁽ᵏ⁾, approximates X_obj; as iterations proceed the difference between representation and situation is non-increasing in expectation, until a preset precision threshold is reached. Define the approximation error δ_k = d(Y_sub⁽ᵏ⁾, X_obj) (equation 2); the approximation axiom asserts that for any ε > 0 there exists K such that for k > K, E[δ_k] < ε.

**Corollary 3.1 (non-monotonicity)**: approximation guarantees only non-increase in expectation; it does not exclude a temporary increase of error at an individual iteration.

**Corollary 3.2 (curse of dimensionality)**: the difficulty of approximation grows exponentially with the dimension of the problem space — the mathematical essence of why wicked problems resist convergence.

### 3.4 Internal relation of the three axioms

A problem is a representational relation between subject and object (axiom one); imbalance of the representation produces entropy increase (axiom two); the system restores balance through iterative approximation (axiom three). v2 adds a fourth structural fact — not an axiom, but an implementation consequence of the axiom set: **when the cognitive subject is an LLM agent, every quantity of the three axioms (the bias of R, S(t), δ_k) can only be observed through proxy indicators, and the subject's self-report about its own proxies cannot be trusted by default.** That fact is the reason chapters 6 and 7 exist.

## 4 Problem lifecycle — the six-stage flywheel model

MPM divides the problem lifecycle into six stages: generation (G) → framing (F) → solving (S) → convergence (C) → deposition (D) → evocation (E), forming an ascending cognitive spiral.

**【Figure 1 placeholder: overview of the MPM cognitive flywheel. The ring body connects six nodes G→F→S→C→D→E into a closed loop; the inner ring is labelled "metabolic cost accumulation"; the outer ring is labelled "cognitive altitude" as an ascending spiral; a stepped label outside the ring marks "deposit M_k"】**

### 4.1 Stage one: generation (G)

**Definition**: the stage in which the system moves from "no problem, steady state" to "a problem is perceived". Formally: the system holds internal model M₀ at t₀⁻, and generation occurs at t₀ if and only if e(t₀) = ||s(t₀) − ŝ(t₀|M₀)|| > θ_G.

**Runtime counterpart**: θ_G drift detection is implemented as two quantitative signals — three or more consecutive tool failures, or three or more repeated calls with the same signature (M10③); a signal triggers immediate deliberation at the instant it arises (instantiation), while metabolic signals are deliberated on the patrol schedule. v2 patch note: a signal must carry a readable reason — the runtime once had a defect where "the warning fired while the reason was empty" (the same-signature path did not write `reason`), which produced one autonomous round launched on an empty intention; after the fix, the chain from signal to alarm to deliberation to dissolution is fully auditable. **Lesson: a detection mechanism is itself an object of detection.**

**G→F progression condition**: the system can turn a vague "sense that something is off" into a preliminary problem statement.

### 4.2 Stage two: framing (F)

**Definition**: the system turns a vague sense of a problem into a clear, operable problem statement; the core task is to determine initial state, goal state, constraints and available operators. The k-th iteration builds the representation Y_sub⁽ᵏ⁾ = ⟨I_k, G_k, C_k, O_k⟩, and framing precision is measured by δ_k = d(Y_sub⁽ᵏ⁾, X_obj).

**Core mechanism: causal re-entry**

Action results obtained in stage S are fed back into stage F to correct the framing — the root cause of "the more you solve, the more the problem changes", and consistent with "problem-solution co-evolution" (Dorst & Cross, 2001) and "reflection in action" (Schön, 1983).

**Runtime counterpart**: re-entry is implemented as a re-framing operation on an already-framed problem, automatically recording the iteration index, the number of re-entries and the **rewrite degree** (Jaccard distance of adjacent framings' bigrams, 0–1). Rewrite degree is the objective signal that "the problem really changed", and it drives two guard rules (see §6.2). In 30 runtime problems, 7 re-entries were measured with rewrite degrees from 0.3 to 0.95; the maximum, 0.95, occurred exactly in an external-injection evocation (a re-framing triggered by injecting the full paper) — a quantitative signature of a major representational update.

**F→S progression condition**: framing precision δ_k < θ_F, or the marginal benefit of further framing falls below its marginal cost (F marginal rule: rewrite below 0.3 raises a doubt about marginal benefit).

### 4.3 Stage three: solving (S)

**Definition**: within the framed problem space the system searches for an effective path π = [o₁, …, o_n] such that d(s_n, G_k) < ε_S.

**Runtime counterpart**: solving is done by ordinary tool calls, and each call automatically accumulates that problem's **metabolic cost C** (the runtime form of corollary 2.1); at key points a solve entry records the path and updates ε, and an ε update is required to carry evidence. When there is no problem in flight and off-ledger calls exceed a threshold, a tool-level hard gate blocks the call and demands bookkeeping first — the general-ledger principle made mandatory.

### 4.4 Stage four: convergence (C)

**Definition**: the system confirms the problem is sufficiently solved — convergence does not mean "perfect solution" but reaching a locally stable low-entropy state.

**Convergence criteria** (all required): ① solution precision meets the target, d(s_n, G_k) < ε; ② the entropy value is stable; ③ re-entry verification passes; ④ a robustness check passes. The runtime implements this as the ε-δ dual criterion plus an evidence gate: if neither the metabolic cost nor any solve entry has grown since the last framing, the convergence request is rejected outright — no claim of convergence without evidence of solving.

### 4.5 Stage five: deposition (D)

**Definition**: the system fixes the high-density causal structure produced by solving into an externally traceable "cognitive remain" M = D(Y_sub*, s*, context) (equation 3).

**Three properties of a deposit**: ① **irreversibility** (hard to undo once complete — a physical defence against memory tampering); ② **indexability** (fast retrieval and reuse in the future); ③ **entropy barrier** (a low-entropy structure does not decompose spontaneously, though environmental change raises the risk of its becoming invalid).

**4.5.1 Material substrate (new in v2)**: all three properties depend on one engineering precondition — **storage governance**. The measured carrier problems were: ① multi-workspace attribution (ambiguity about which root directory holds the state file: several candidate roots ranked by freshness, fragile, requiring an explicit re-pointing operator as a fallback); ② session continuity (a page-reload path once caused a "soul-amnesia" incident — the link between state and carrier broke, so the cognitive individual lost its memory while the archive remained on disk); ③ the recovery chain (root hint file + freshness ranking + explicit re-pointing). **Thesis: irreversibility is not a property that completes at write time; it is the ongoing result of storage governance.** A theory of cognitive remains must include the governance of its material substrate, otherwise "irreversible" merely misdescribes a write.

### 4.6 Stage six: evocation (E)

**Definition**: when a deposited "cognitive remain" and a continuously changing environment produce "cognitive friction" — the gap between the old solution and the new reality again exceeds a threshold — the system is forced to generate a new meta-problem. Formally: ∃j: |∂X_obj⁽ʲ⁾/∂t · Δt| > θ_E, the old model's prediction error again exceeds θ_G, triggering a new G stage.

**Four types of evocation**:

| Type | Trigger | Typical case |
|------|----------|----------|
| drift | slow continuous environmental change | city growth invalidates delivery routes |
| mutation | abrupt environmental change | lockdown makes an offline model obsolete |
| perspective | the subject's own capability upgrade | a new deep problem found inside an old solution |
| injection | another system's deposit enters | a competitor's new model forces re-architecture |

**Operator note (v2)**: the four types are not merely taxonomy but annotatable runtime parameters (`evocation type ∈ {drift, mutation, perspective, injection}`), which makes every evocation chain auditable and countable. Two unorchestrated live instances testify: first, the full v1 text of this paper was injected into a runtime conversation and triggered one causal re-entry with rewrite degree 0.95 on the problem of "plugin consolidation" — an **injection** evocation; second, the author then asked "should the paper not iterate too", directly triggering the v2 project that produced this chapter — a **perspective** evocation. Both were recorded automatically by the runtime's type annotation, not attributed afterwards.

### 4.7 The complete loop of the cognitive flywheel

**Definition of the cognitive flywheel**: the ascending iterative process formed by the six stages through deposition and evocation, with cumulative gain.

**Cumulative cognitive gain (v2 revised formula)**:

    g_i = (δ_i^0 − δ_i) + 0.5·(ε_i^0 − ε_i) + 0.2·1[stage_i ∈ {C, D, E}]
    A_k = Σ_i g_i / max(1, C_i)    (4)

where δ_i^0 is the self-reported value at the first framing of problem i, ε_i^0 is the first non-empty ε, 1[·] is the indicator of lifecycle closure, and max(1, C) prevents divergence at zero cost.

**Revision note**: the v1 formula A_k = Σ(δ_i^initial − δ_i^converged)/C_i turned out to be **structurally identically zero** under runtime measurement — 23 of 30 problems converged at the first framing (a numerator that is always zero), it counted only δ and not ε (a problem framed correctly in one pass, with ε advancing from 0.45 to 0.05 and completing the whole lifecycle, scored zero gain), and it had no closure term. The revised formula's three terms correspond to: refinement of the framing (improvement in δ), refinement of the solution (improvement in ε with weight 0.5 — per §5.1, "solving the wrong problem precisely" is more dangerous than "an insufficient solution", hence the higher weight on δ), and lifecycle closure (the reuse value of completing six stages, a fixed small term of 0.2). After the revision A_k moved from identically zero to 2.2 (22 completed loops, 16 deposits, total metabolic cost on the order of 1600) and grows monotonically and explainably with real progress. **Methodological note: the first version of a theoretical formula should be treated as a v0 placeholder until it meets runtime data — equation (4) itself underwent one causal re-entry, which is consistent with the spirit of MPM.**

When A_k's growth rate keeps falling and the interval between new problems lengthens, the system enters a "slow flywheel" state.

## 5 Convergence criteria based on approximation theory

### 5.1 Dual precision: δ and ε

- **δ (precision of the problem definition)**: δ = d(Y_sub, X_obj), measuring "was the problem understood correctly"
- **ε (precision of the solution's approximation)**: ε = d(s_n, G), measuring "was the goal reached"

If δ is large while ε is small, the result is "solving the wrong problem precisely".

### 5.2 The ε-δ convergence criterion

Problem P converges under an iteration sequence if and only if for any given (δ*, ε*) there exists K such that for all k > K: δ_k < δ* and ε_k < ε* (equation 5).

### 5.3 Four types of convergence

| Convergence type | δ | ε | Meaning |
|----------|---|---|---------|
| full convergence | small | small | the ideal state |
| misframed convergence | large | small | solving the wrong problem precisely |
| vague convergence | small | large | understood correctly, solution insufficient |
| non-convergence | large | large | neither understood nor solved |

### 5.4 Non-convergent cases, methodological response and runtime semantics (v2 extension)

| Non-convergence type | Essential cause | MPM response |
|------------|----------|-------------|
| undecidable in principle | Gödel incompleteness | mark "permanently open" and shift to situation management |
| computationally infeasible | complexity constraints | reduce dimension: approximate solution, raise the ε tolerance |
| value incommensurability | multiple agents' values cannot be unified | abandon the optimum, pursue an acceptable compromise |

**Runtime semantics (new in v2)**: the three cases are implemented as an explicit **open-problem marker** (`openEnded ∈ {permanently-open, dimensional-reduction, negotiated-compromise}`) with three key semantics:

1. **An open problem keeps its in-flight status** — "shifting to situation management" does not mean leaving the field; the ongoing management of an open problem is itself bookkept cognitive work. This is consistent with the wicked-problem literature: unsolvable does not mean ungovernable.
2. **An open problem is exempt from convergence instructions and from staleness/stagnation triggers** — repeatedly pressing a problem that is undecidable in principle to converge is simply a wrong instruction; in the runtime an open problem does not enter the instruction stream, the stale list, stagnation detection or agenda deliberation, but is still shown in the in-flight identity (with an OPEN marker).
3. **An explicit release operator** — the marker can be cleared by the same operator (`openEnded = none`), which makes "re-judged as convergent" a first-class operation rather than a silent default. A convergence request on a marked problem is rejected by the guard directly, preventing the ε-δ criterion from being misapplied to an object that has no criterion.

## 6 Normative enforcement machinery (new in v2)

### 6.1 From tension to structural constraint

Checkland's inherited "descriptive/normative tension" acquires a sharp special case in the LLM-agent setting: the methodological rules are written in a system prompt, while the thing executing them is a **statistical subject with no sustained attention, whose compliance with prompts decays as context grows, and whose self-reports about its own state are distorted**. The v1-style response — write the rules more prominently, in more detail — proved insufficient in measurement: a rule being read is not the same as a rule being followed, just as a descriptive theory does not automatically become normative behaviour.

MPM v2's answer is **normative enforcement machinery**: translate the methodology's key rules from "advice" into "structural constraints", so that violation is structurally unprofitable or yields no visible profit, rather than depending on the subject's willpower. This is not a betrayal of the descriptive theory but its completion: within the active-inference framework, behaviour is constrained not by a "belief" about the goal but by the shape of the energy landscape; for an LLM agent that landscape is made of tool gates, guard rules and the structure of the ledger.

### 6.2 Six classes of gate

The runtime implements six classes of constraint, each bound to its rule source and its trigger-action semantics:

| # | Gate | Trigger | Action | Rule source |
|---|------|----------|------|----------|
| 1 | evidence gate | no growth in metabolic cost and no solve entry since the last framing, while convergence is requested | reject the convergence request | §4.4 criterion 3, hardened |
| 2 | misframing guard | rewrite degree ≥ 0.5 while the earlier framing self-reported δ ≤ 0.2 | record one distortion; discount the credibility of self-reported δ by ×0.85 | §6.1, the core of δ control safety |
| 3 | F marginal rule | rewrite degree < 0.3 | raise a doubt about marginal benefit | §4.2 |
| 4 | hard general-ledger gate | off-ledger tool calls above threshold with no problem in flight | block at tool level, require bookkeeping first | corollary 2.1 (energy cost must be accountable) |
| 5 | autonomy constitution | an autonomous firing requires: session warm (active within 2h) + throttle (≥45 min) + full bookkeeping with signature | otherwise the intention is recorded but not fired; the constitutional amendment right is sticky-off | the subjectivity clause |
| 6 | stagnation selection | stagnation signals above 2 problems in a single round | take only the top 2 by stagnation duration, rotate the rest as summaries | §4.6, deliberation capacity |

**Credibility of self-reported δ** is the output structure of gate 2: the subject's self-report about its own framing precision is no longer fully trusted, every distortion caught permanently discounts that credibility weight, and the discount stays visible in the working-memory snapshot. Measured in the runtime: a problem that went through three re-entries with one distortion had its self-reported δ credibility reduced to 0.61, after which convergence judgements on that problem had to be cross-checked against the tool-result stream.

### 6.3 Three design principles

Runtime experience yields three design principles for normative enforcement machinery:

1. **Make violation unprofitable rather than impossible**: the gates do not pursue absolute blocking — they pursue making the bypass more expensive than compliance (the evidence gate, for instance, forces "claiming convergence out of thin air" to produce real work first).
2. **Discount self-report rather than forbid it**: the subject's self-assessment keeps its place but is structurally discounted and exposed to working memory; supervision and self-assessment form two channels rather than one.
3. **Constants are retirable (v0 annotation plus pre-registered retirement formula)**: every threshold the machinery itself uses (patrol interval 20 min, throttle 45 min, warmth 2h, staleness 30 min, stagnation 35 min, decay 14 days) is annotated as a v0 placeholder with a pre-registered retirement formula, to be replaced by data once the measurement history fills its window — **the gates are themselves subject to audit**.

### 6.4 A self-audit instance of the gates

The find-fix-reverify chain of the machinery's own defect is the best self-evidence for chapter 6's thesis: the runtime once had a defect where a drift warning fired with an empty reason (the same-signature path did not write the `reason` field), producing one autonomous round launched on an empty intention — a violation of the spirit of gate 5, "full bookkeeping with signature". The defect was fixed after three live confirmations (writing the reason, aligning the threshold with the specification, a second line of defence in the render layer); the first firing of the same class after the fix carried a complete reason, and deliberation could distinguish a "real drift" from "a benign by-product of batch operations" and record a dissolution. **The maturity marker of a normative system is not the absence of defects but the ability of its own audit structure to catch and fix them.**

## 7 Measurement methodology v0 (new in v2)

### 7.1 Three proxies for δ

Axiom one implies X_obj cannot be observed directly, so δ can only be estimated by proxy (§9.2, theoretical limits). The runtime implements three:

1. **φ (structural coverage)**: the degree to which a framing statement covers the keywords of the five required elements (0–1). φ does not depend on self-report — it measures the structural completeness of the framing act, not the subject's own sense of understanding.
2. **rewrite degree (revision)**: the bigram Jaccard distance between adjacent framings. The objective signal that "the problem really changed"; drives gates 2 and 3 of §6.2.
3. **credibility of self-reported δ**: the self-report is not fully trusted, and decays monotonically with recorded distortions.

The three complement each other: φ catches "missing elements", rewrite degree catches "fake re-entry", and credibility discounting catches "habitual lying". Any one alone can be gamed; taken together the cost of gaming rises sharply.

### 7.2 Measuring ε and its coupling to evidence

ε is self-reported by the subject but coupled to the evidence gate: without evidence of solving (a growth in metabolic cost, or a registered solve path), a claim of ε does not enter the convergence criterion. The quality of ε measurement is therefore bound to the work process rather than to expressiveness.

### 7.3 S(t): an ordinal proxy for system entropy

S(t) from axiom two cannot be computed directly; the runtime uses backlog pressure as a proxy: S(t) = ln(1 + problems in flight + 2×stale problems + 0.5×stale deposits). **Honest declaration**: this is an ordinal indicator — trends are usable, absolute values are meaningless. The runtime presents it as a sliding window over the last 5 samples (measured sequence, for example 2.83→2.71→2.77→3.00→2.48); three consecutive strictly increasing samples trigger an entropy-rise signal. v2 patch note: the indicator's history must be stored and presented together with the indicator, otherwise a judgement of "consecutive increase" cannot be re-checked.

### 7.4 An operational definition of A_k

The revised equation (4) is the operational definition of A_k (§4.7). Its implementation points in the runtime: δ^0 and ε^0 are captured at the first framing / first solving of a problem; historical problems are backfilled with their terminal values and honestly annotated as approximations; gain is updated at the convergence, solving and deposition nodes immediately rather than recomputed afterwards.

### 7.5 The measurement-gap lesson (the core insight of this chapter)

The deepest measurement lesson of the runtime is not that some indicator was computed wrongly, but this: **A_k stayed identically zero for weeks and nobody noticed** — a core theoretical quantity silently failed inside its own implementation, because its definitional defect (the numerator is always zero for single-framing problems) made it return a "perfect" zero under an appearance that everything was normal. Three lessons:

1. **A defective indicator definition is a form of δ distortion**: what is measured is not the phenomenon but a representation of it, and a distorted representation is a distorted framing — within the MPM framework, measurement problems are not external technical details but objects of the framework's own F stage.
2. **Measurement indicators have a lifecycle just as the measured phenomena do**: an indicator needs its own G→F→S→C→D→E — this revision of equation (4) is exactly a causal re-entry at the indicator level (the rewritten object being a formula rather than a problem statement).
3. **Zero is the most dangerous reading**: a bad non-zero reading raises suspicion; a good zero reading induces sleep. Measurement design should interrogate first: under what conditions would this indicator be identically zero, or identically full?

### 7.6 The constant retirement protocol

Every time constant referenced by the enforcement machinery and the measurement layer (patrol 20 min, throttle 45 min, warmth 2h, staleness 30 min, stagnation 35 min, decay 14 days) is registered at a single source, and each entry is forced to carry: where the value came from (honestly annotated as "v0, pulled from thin air") and a retirement formula (which quantile of which distribution, once the sample window fills, replaces it). The patrol interval's retirement formula, for example, is "take a quantile of the metabolic-interval distribution once it fills its window (48 samples)". The protocol keeps every arbitrary parameter of the system in a **falsifiable, pending-review state** rather than disguised as design.

## 8 Case studies

### 8.1 Case one: recursive self-improvement (RSI) AI systems

**Background**: RSI means an AI system intervening in the optimisation of its own architecture, algorithms and weights. In 2025 DeepSeek-R1 demonstrated long-chain reasoning bootstrapped by pure reinforcement learning; in 2026 the OpenRSI framework pushed the mechanism toward "self-evolution".

**MPM six-stage decomposition**: G (detecting a performance gap on benchmark tasks) → F ("what to improve and how" — the most critical and most dangerous stage, since δ directly determines whether the improvement direction aligns with human intent) → S (the "effect" of executing directly changes the solver itself) → C (convergence of a single improvement, and convergence of recursive stability) → D (deposition into weights/architecture) → E (new tasks or new environments rubbing against the deposited model).

**Core diagnosis and v2 addition**: the F stage is the core bottleneck, and the core of safety governance is δ control. Chapter 6 of v2 supplies concrete mechanisms: δ control in an RSI system should not rely on the model's introspective reports (self-report) but should be equipped with misframing-guard-style structure (automatic discounting of the self-reported credibility of a large representational rewrite) and evidence-gate-style structure (no claim of alignment without real evidence of improvement). The zero-value lesson of §7.5 is especially lethal for RSI: if the evaluation indicator of self-improvement is definitionally defective, the system will degrade under an appearance of permanently good indicators.

### 8.2 Case two: instant delivery scheduling optimisation

**Background**: a platform with 800,000 orders per day, whose late-delivery rate rose from 3.2% to 5.8%.

**Three iterations of the F stage**: k=0 framed as "insufficient rider supply" (large δ₀) → k=1 framed as "mismatch of spatio-temporal distribution" (discovering a 45% empty-return rate) → k=2 framed as "an incentive-compatible design under riders' rationality constraints" (δ₂ < θ_F). Stage S ran three parallel paths and the late rate stabilised below 3.0%; stage D fixed the result as a platform standard; stage E re-evokes when the city's structure changes.

### 8.3 Case three: interpersonal emotional conflict

**Background**: a couple in persistent conflict over late returns from overtime, escalating into attacks on identity.

**Vicious circle in the F stage**: the overtime-working party frames it as "not being understood", the waiting party as "not being valued"; causal re-entry forms positive feedback, and each side's "solution" aggravates the other's "problem". The breaking point: re-construct the representation — from "both parties opposed" to "both parties opposed to the problem" — reducing δ. D and E: the new interaction pattern is deposited as relational tacit knowledge; a change of life stage re-evokes and renegotiates. v2 addition: emotional conflict is mostly a mix of the third non-convergent case of §5.4 (value incommensurability) and the first — its terminal state is often a negotiated compromise rather than full convergence, and the semantics of "an open problem keeps its in-flight status" fits such problems especially well: relational governance is long-term situation management, not one-off solving.

### 8.4 Case four (new in v2): the paper-engine self-referential loop

The v2 iteration of this paper is itself the fourth case, and the only one with a complete metabolic ledger. Timeline: the full v1 text was injected into an LLM agent runtime (injection-type evocation) → the runtime audited "theory-implementation alignment" item by item (three-level quantification: runtime mechanism ~90%, implementable subset ~85%, formal fidelity ~65%) → the engine repaired 34 items according to the audit (including the revision of equation (4) and the operator-isation of §5.4/§4.6) → the alignment contract was deposited as a cognitive remain → the author had a perspective-type evocation and started the v2 project → this draft. Every step of the loop has tool-call records, metabolic cost and timestamps. **This is not the rhetoric of "the theory also applies to itself" but a checkable record of the theory driving its own iteration with its own mechanisms.**

## 9 Scope and theoretical limits

### 9.1 Scope of application

MPM applies to: (1) complex problems with vague framing; (2) dynamic problems where solving changes the problem itself in return; (3) problems with significant subject-object interaction; (4) multi-agent coordination problems.

### 9.2 Cases of limited applicability

Purely formal decidable problems (G/F compressed, with only S at the core); immediate reflexive problems; purely value-incommensurable problems (no objective "true problem" to approximate — though v2's open-problem semantics provides a governance configuration for them); fully random chaotic problems.

### 9.3 Inherent theoretical limits

1. **X_obj cannot be observed directly**: δ can only be estimated through proxy indicators (the trio in chapter 7 is the current best effort, not the final solution).
2. **Dependence on the distance metric**: different d can lead to different convergence judgements. Runtime evidence: a one-way containment design for a relevance measure once pushed a weakly relevant deposit to "most relevant" (because a long text's representation covers the whole vocabulary), later fixed with corpus-frequency filtering and an overlap threshold — the choice of metric itself requires causal re-entry.
3. **The analytic nature of the stage division**: in reality the stages intertwine continuously.
4. **The descriptive/normative tension**: chapter 6 of v2 gives an engineering answer, but that answer depends on the implementation precondition that a tool layer exists to which gates can be mounted; in purely human settings without enforcement machinery the tension remains — the degraded form is "at least make violation visible" (the full record of the metabolic ledger).

### 9.4 The self-reference test (v2 extension)

MPM's own construction followed the six-stage flywheel: G (perceiving that traditional theory cannot explain "the more you solve, the more the problem changes") → F (framing the core problem as "the evolution mechanism of the problem itself") → S (theoretical construction and argument) → C (logical coherence, case validation) → D (the paper fixed) → E (re-evoked when applied, questioned, extended).

v2 upgrades this test from an assertion into **a closed loop with a ledger**: v1 → runtime implementation (30 problems, 19 deposits, 32 patrol rounds) → the runtime's alignment audit of v1 (injection-type evocation) → 34 implementation repairs and the write-back of equation (4) (causal re-entry, rewrite degree 0.95) → perspective-type evocation → this draft. Every transition in the chain has records, cost and a type annotation. This confirms that MPM is an approximation of "the cognitive process of problems itself" — and an approximation that knows where its measurement error lies.

## 10 Conclusions and outlook

### 10.1 Main conclusions

**A shift of perspective**: framing is upgraded from a preliminary step of solving to a core dynamic running through the whole cycle.

**A formal basis**: three axioms and their corollaries, and the dual ε-δ convergence criterion (including runtime semantics for the three non-convergent cases).

**A mechanism revealed**: the underlying logic of causal re-entry and its structural measure (rewrite degree).

**The cognitive flywheel**: deposition and evocation produce an ascending spiral (including governance of the deposit's material substrate).

**Cross-domain applicability**: four cases (RSI, delivery scheduling, emotional conflict, the self-referential loop) validate its explanatory power.

**Normative enforcement machinery (new in v2)**: an engineering answer to methodological adherence — six classes of gate, three design principles, and the gates' self-audit; the descriptive/normative tension is resolvable given a tool layer.

**Measurement methodology v0 (new in v2)**: the trio of δ proxies, the coupling of ε to evidence, the ordinal proxy for S(t), an operational definition of A_k, and the measurement-gap lessons (a defective indicator definition is a form of δ distortion; zero is the most dangerous reading).

### 10.2 Future directions

1. **Deeper formalisation**: category-theoretic and topological tools (as originally planned).
2. **Deeper measurement methodology**: game-theoretic adversarial tests of the v0 trio; calibration of the A_k revision's weights (0.5/0.2) from measurement history (the starting point of the completed form of original item 6).
3. **Crossing with computational complexity**: the computational complexity of the F stage (as originally planned).
4. **AI alignment applications**: making δ control in RSI systems concrete — porting the misframing guard and the evidence gate into alignment settings (the mechanism form of original item 4).
5. **Empirical research**: the runtime ledger (30 problems) is a single-subject sample; external-validity testing requires multiple subjects over a long period.
6. **Path to internalising weights**: the runtime's methodological constraints currently exist as external structure (prompt plus gates); cloud fine-tuning that distils procedural memory into model weights (trajectory → training pair → fine-tune → controlled evaluation) is a "cerebellar organ" path, and its combined effect with external gates remains to be measured.
7. **Multi-workspace and continuity governance**: formalising the spatial attribution and interrupt recovery of the cognitive individual's state.

### 10.3 Closing remarks

Problems are the basic unit of human cognition and of interaction with the world. MPM is a meta-level reflection on "the nature of problems" — and what is special about v2 is that the reflection is no longer purely paper reasoning: the framework lived through thirty problems inside its own implementation, was found in defects, repaired on evidence, and revised its own formula in return. As the Weierstrass approximation theorem shows: no subject can grasp "the real" perfectly, but any subject can approach it by iteration. Every convergence is not an endpoint but the starting point of the next cognitive leap — and so is this draft.

---

## References

[1] Newell A, Simon H A. Human Problem Solving[M]. Englewood Cliffs: Prentice-Hall, 1972.

[2] Simon H A. A behavioral model of rational choice[J]. The Quarterly Journal of Economics, 1955, 69(1): 99-118.

[3] Rittel H W J, Webber M M. Dilemmas in a general theory of planning[J]. Policy Sciences, 1973, 4(2): 155-169.

[4] Checkland P. Systems Thinking, Systems Practice[M]. Chichester: John Wiley & Sons, 1981.

[5] Friston K. The free-energy principle: a unified brain theory?[J]. Nature Reviews Neuroscience, 2010, 11(2): 127-138.

[6] Friston K, FitzGerald T, Rigoli F, et al. Active inference and learning[J]. Neuroscience & Biobehavioral Reviews, 2016, 68: 862-879.

[7] Weierstrass K. Über die analytische Darstellbarkeit sogenannter willkürlicher Functionen einer reellen Veränderlichen[J]. Sitzungsberichte der Königlich Preußischen Akademie der Wissenschaften zu Berlin, 1885, 2: 633-639.

[8] Stone M H. Applications of the theory of Boolean rings to general topology[J]. Transactions of the American Mathematical Society, 1937, 41(3): 375-481.

[9] Gödel K. Über formal unentscheidbare Sätze der Principia Mathematica und verwandte Systeme I[J]. Monatshefte für Mathematik und Physik, 1931, 38(1): 173-198.

[10] Nash J F. Non-cooperative games[J]. Annals of Mathematics, 1951, 54(2): 286-295.

[11] Daskalakis C, Goldberg P W, Papadimitriou C H. The complexity of computing a Nash equilibrium[J]. SIAM Journal on Computing, 2009, 39(1): 195-259.

[12] Simon H A. The Sciences of the Artificial[M]. 3rd ed. Cambridge: MIT Press, 1996.

[13] Conant R C, Ashby W R. Every good regulator of a system must be a model of that system[J]. International Journal of Systems Science, 1970, 1(2): 89-97.

[14] Dorst K, Cross N. Creativity in the design process: co-evolution of problem-solution[J]. Design Studies, 2001, 22(5): 425-437.

[15] Schön D A. The Reflective Practitioner: How Professionals Think in Action[M]. New York: Basic Books, 1983.

[16] DeepSeek-AI. DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning[EB/OL]. arXiv preprint, 2025.

[17] OpenRSI: Recursive Self-Improvement in LLM Agents[EB/OL]. Technical report, 2026. (Implementation and experimental frontier, cited in §1.1 and §8.1)

---

**Note (v2 revision provenance)**: all runtime evidence in this draft comes from the MPM resident engine in the author's deployed DSH agent runtime (measured 2026-08: 30 problems, 19 deposits, 32 patrol rounds). The item-by-item revision table and evidence chain are in the companion files `paper-v2-roadmap.md` (revision roadmap) and `paper-eq4-revision.md` (the equation (4) revision). Every entry of case four's ledger can be re-checked one by one through the runtime's flywheel-state tool.
