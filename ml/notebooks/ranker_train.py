"""Обучение LightGBM-ранкера (ТЗ-2). Импортируется ноутбуком train_ranker.ipynb."""

from __future__ import annotations

import json
import math
import warnings
from pathlib import Path

import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import log_loss, roc_auc_score
from sklearn.model_selection import train_test_split

SEED = 42
REQUIRED_LGBM = "3.3.5"
LATENT_KEYS = ("r", "m", "c_e", "fraud", "epsilon", "pop")
DGP_FEATURES = {
    "min_edge",
    "match_mean",
    "count",
    "liquidity_min",
    "is_frozen",
    "is_proposed",
    "progress",
    "category_popularity",
}
MIN_DELTA_OVERALL = 0.02
MIN_DELTA_ADD = 0.02
MAX_AUC = 0.95
CALIB_TOL = 0.05
CALIB_MIN_BIN = 30
N_BINS = 10
N_GOLDEN = 20
EARLY_STOPPING = 50


def find_root(start: Path | None = None) -> Path:
    here = (start or Path.cwd()).resolve()
    for p in [here, *here.parents]:
        if (p / "ml" / "features.json").exists():
            return p
    raise FileNotFoundError("не найден корень репозитория (ml/features.json)")


def set_seeds(seed: int = SEED) -> None:
    np.random.seed(seed)


def assert_lightgbm_v3() -> None:
    ver = getattr(lgb, "__version__", "")
    if ver != REQUIRED_LGBM:
        raise RuntimeError(f"ожидается lightgbm=={REQUIRED_LGBM}, сейчас {ver!r}")


def load_contracts(root: Path) -> tuple[list[str], pd.DataFrame]:
    manifest = json.loads((root / "ml" / "features.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, list) or not manifest:
        raise ValueError("features.json должен быть непустым списком имён")
    csv_path = root / "ml" / "data" / "synthetic_v1.csv"
    df = pd.read_csv(csv_path)
    after_raw = list(df.columns[df.columns.get_loc("raw_json") + 1 :])
    if after_raw != manifest:
        raise AssertionError(
            f"колонки CSV после raw_json не совпадают с манифестом:\n"
            f" csv={after_raw}\n json={manifest}"
        )
    leaked = sorted(set(manifest) & set(LATENT_KEYS))
    if leaked:
        raise AssertionError(f"утечка латенток в фичи: {leaked}")
    return manifest, df


def make_xy(df: pd.DataFrame, manifest: list[str]) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    y = (df["label"] == "COMPLETED").astype(int).to_numpy()
    X = df[manifest].copy()
    formula = df["formula_score"].to_numpy(dtype=float)
    return X, y, formula


def stratified_split(
    df: pd.DataFrame, X: pd.DataFrame, y: np.ndarray, formula: np.ndarray, seed: int = SEED
):
    strata = df["label"].astype(str) + "_" + df["stage"].astype(str)
    idx = np.arange(len(df))
    train_idx, test_idx = train_test_split(
        idx, test_size=0.20, stratify=strata, random_state=seed
    )
    strata_train = strata.iloc[train_idx]
    fit_idx, val_idx = train_test_split(
        train_idx, test_size=0.20, stratify=strata_train, random_state=seed
    )
    return {
        "train": train_idx,
        "fit": fit_idx,
        "val": val_idx,
        "test": test_idx,
        "X_fit": X.iloc[fit_idx],
        "y_fit": y[fit_idx],
        "X_val": X.iloc[val_idx],
        "y_val": y[val_idx],
        "X_test": X.iloc[test_idx],
        "y_test": y[test_idx],
        "formula_test": formula[test_idx],
        "df_test": df.iloc[test_idx].reset_index(drop=True),
    }


def train_lgbm(split: dict, seed: int = SEED) -> lgb.LGBMClassifier:
    assert_lightgbm_v3()
    model = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=500,
        learning_rate=0.03,
        num_leaves=16,
        min_child_samples=80,
        reg_lambda=1.0,
        random_state=seed,
        n_jobs=-1,
        verbose=-1,
    )
    model.fit(
        split["X_fit"],
        split["y_fit"],
        eval_set=[(split["X_val"], split["y_val"])],
        eval_metric=["binary_logloss", "auc"],
        callbacks=[
            lgb.early_stopping(EARLY_STOPPING, verbose=False),
            lgb.log_evaluation(period=0),
        ],
    )
    return model


def _clip_proba(p: np.ndarray) -> np.ndarray:
    return np.clip(p, 1e-6, 1 - 1e-6)


def metrics_block(y: np.ndarray, p_model: np.ndarray, p_base: np.ndarray) -> dict:
    return {
        "auc_lgbm": float(roc_auc_score(y, p_model)),
        "auc_formula": float(roc_auc_score(y, p_base)),
        "logloss_lgbm": float(log_loss(y, _clip_proba(p_model))),
        "logloss_formula": float(log_loss(y, _clip_proba(p_base))),
    }


def slice_metrics(df_test: pd.DataFrame, y: np.ndarray, p_model: np.ndarray, p_base: np.ndarray) -> dict:
    out = {"overall": metrics_block(y, p_model, p_base)}
    out["overall"]["n"] = int(len(y))
    masks = {
        "ADD": df_test["event"].to_numpy() == "ADD",
        "PROPOSED": df_test["stage"].to_numpy() == "PROPOSED",
        "FROZEN": df_test["stage"].to_numpy() == "FROZEN",
        "IN_PROGRESS": df_test["stage"].to_numpy() == "IN_PROGRESS",
    }
    for name, mask in masks.items():
        if mask.sum() < 20 or y[mask].min() == y[mask].max():
            out[name] = {"auc_lgbm": math.nan, "auc_formula": math.nan, "n": int(mask.sum())}
            continue
        block = metrics_block(y[mask], p_model[mask], p_base[mask])
        block["n"] = int(mask.sum())
        out[name] = block
    return out


def reliability_table(y: np.ndarray, p: np.ndarray, n_bins: int = N_BINS) -> pd.DataFrame:
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    rows = []
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        if i == n_bins - 1:
            mask = (p >= lo) & (p <= hi)
        else:
            mask = (p >= lo) & (p < hi)
        n = int(mask.sum())
        pred = float(p[mask].mean()) if n else math.nan
        emp = float(y[mask].mean()) if n else math.nan
        rows.append(
            {
                "bin": i,
                "lo": lo,
                "hi": hi,
                "n": n,
                "predicted": pred,
                "empirical": emp,
                "abs_err": abs(pred - emp) if n else math.nan,
                "supported": n >= CALIB_MIN_BIN,
            }
        )
    return pd.DataFrame(rows)


def plot_reliability(table: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 6))
    ok = table["supported"]
    ax.plot([0, 1], [0, 1], "--", color="gray", label="ideal")
    ax.scatter(table.loc[ok, "predicted"], table.loc[ok, "empirical"], c="C0", s=40, label="supported bins")
    weak = ~ok & table["n"].gt(0)
    if weak.any():
        ax.scatter(
            table.loc[weak, "predicted"],
            table.loc[weak, "empirical"],
            c="C1",
            s=30,
            marker="x",
            label="low support",
        )
    ax.set_xlabel("predicted P(COMPLETED)")
    ax.set_ylabel("empirical rate")
    ax.set_title("Reliability diagram")
    ax.legend()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def shap_bundle(model: lgb.LGBMClassifier, X_test: pd.DataFrame, fig_dir: Path) -> dict:
    fig_dir.mkdir(parents=True, exist_ok=True)
    for stale in fig_dir.glob("shap_dependence_*.png"):
        stale.unlink()
    explainer = shap.TreeExplainer(model)
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="LightGBM binary classifier with TreeExplainer shap values output has changed",
        )
        shap_values = explainer.shap_values(X_test)
    if isinstance(shap_values, list):
        shap_values = shap_values[1]
    shap_values = np.asarray(shap_values)
    if shap_values.ndim == 3:
        shap_values = shap_values[:, :, 1]
    mean_abs = np.abs(shap_values).mean(axis=0)
    order = np.argsort(-mean_abs)
    names = list(X_test.columns)
    ranked = [(names[i], float(mean_abs[i])) for i in order]
    top4 = [names[i] for i in order[:4]]
    # топ-4 + фичи, по которым ТЗ просит визуально проверить DGP-эффекты
    extra = ["min_edge", "count", "liquidity_min", "match_mean"]
    plot_feats = list(dict.fromkeys([*top4, *extra]))

    plt.figure(figsize=(8, 6))
    shap.summary_plot(shap_values, X_test, show=False, max_display=16)
    plt.tight_layout()
    plt.savefig(fig_dir / "shap_beeswarm.png", dpi=120, bbox_inches="tight")
    plt.close()

    for feat in plot_feats:
        plt.figure(figsize=(6, 4))
        interaction = "liquidity_min" if feat == "match_mean" else "auto"
        shap.dependence_plot(
            feat,
            shap_values,
            X_test,
            interaction_index=interaction,
            show=False,
        )
        plt.tight_layout()
        safe = feat.replace("/", "_")
        plt.savefig(fig_dir / f"shap_dependence_{safe}.png", dpi=120, bbox_inches="tight")
        plt.close()

    rel_idx = names.index("reliability_mean")
    rel_imp = float(mean_abs[rel_idx])
    max_imp = float(mean_abs.max()) if mean_abs.max() > 0 else 1.0
    return {
        "ranked": ranked,
        "top4": top4,
        "plot_feats": plot_feats,
        "reliability_mean_abs": rel_imp,
        "reliability_share": rel_imp / max_imp,
    }


DGP_ROLES = (
    ("is_proposed", "выживание до PROPOSED (воронка)"),
    ("is_frozen", "выживание до FROZEN (воронка)"),
    ("progress", "доля подтверждений на стадии"),
    ("count", "пенальти n=4: −0.05/−0.08·(n−2) в pResp/pConf"),
    ("match_mean", "качество матча: +0.45·mean(c_e) в pResp"),
    ("min_edge", "слабое ребро цикла; порог матчера ≈ 0.35"),
    ("liquidity_min", "min cluster size; насыщение на 1.0"),
    ("reliability_mean", "константа 0.75, в DGP не участвует"),
)


def oracle_analysis(df_test: pd.DataFrame, y: np.ndarray, p: np.ndarray) -> dict:
    raw = df_test["raw_json"].map(json.loads)
    fraud = raw.map(lambda o: bool(o.get("fraud"))).to_numpy()
    eps = raw.map(lambda o: abs(float(o.get("epsilon", 0.0)))).to_numpy()
    reason = raw.map(lambda o: str(o.get("reason", "")))
    pred = (p >= 0.5).astype(int)
    err = pred != y
    high_eps = eps >= np.quantile(eps, 0.75)
    return {
        "n": int(len(df_test)),
        "n_err": int(err.sum()),
        "fraud_rate_all": float(fraud.mean()),
        "fraud_rate_err": float(fraud[err].mean()) if err.any() else 0.0,
        "err_rate_fraud": float(err[fraud].mean()) if fraud.any() else 0.0,
        "err_rate_clean": float(err[~fraud].mean()) if (~fraud).any() else 0.0,
        "abs_eps_all": float(eps.mean()),
        "abs_eps_err": float(eps[err].mean()) if err.any() else 0.0,
        "err_rate_high_eps": float(err[high_eps].mean()) if high_eps.any() else 0.0,
        "err_rate_low_eps": float(err[~high_eps].mean()) if (~high_eps).any() else 0.0,
        "n_fraud": int(fraud.sum()),
        "n_fraud_err": int((fraud & err).sum()),
        "reason_err": reason[err].value_counts().head(5).to_dict(),
    }


def evaluate_gates(metrics: dict, calib: pd.DataFrame, shap_info: dict) -> list[tuple[str, bool, str]]:
    overall = metrics["overall"]
    add = metrics["ADD"]
    delta = overall["auc_lgbm"] - overall["auc_formula"]
    delta_add = add["auc_lgbm"] - add["auc_formula"]
    gates = []

    ok = delta >= MIN_DELTA_OVERALL
    gates.append(("delta_overall", ok, f"AUC(LGBM)-AUC(formula)={delta:.4f} (want ≥ {MIN_DELTA_OVERALL})"))

    ok = delta_add >= MIN_DELTA_ADD
    gates.append(("delta_ADD", ok, f"ADD delta={delta_add:.4f} (want ≥ {MIN_DELTA_ADD})"))

    ok = overall["auc_lgbm"] < MAX_AUC
    gates.append(("auc_cap", ok, f"AUC(LGBM)={overall['auc_lgbm']:.4f} (want < {MAX_AUC})"))

    supported = calib[calib["supported"]]
    if supported.empty:
        gates.append(("calibration", False, "нет бинов с достаточной поддержкой"))
    else:
        worst = float(supported["abs_err"].max())
        ok = worst <= CALIB_TOL
        gates.append(("calibration", ok, f"max |pred-emp| on supported bins={worst:.4f} (want ≤ {CALIB_TOL})"))

    top_hit = set(shap_info["top4"]) & DGP_FEATURES
    ok = len(top_hit) >= 2
    gates.append(("shap_dgp", ok, f"SHAP top4={shap_info['top4']}; DGP overlap={sorted(top_hit)}"))

    ok = shap_info["reliability_share"] <= 0.02 or shap_info["reliability_mean_abs"] < 1e-8
    gates.append(
        (
            "reliability_shap",
            ok,
            f"reliability_mean |SHAP| share={shap_info['reliability_share']:.4f} (want ≈ 0)",
        )
    )
    return gates


def df_to_markdown(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for _, row in df.iterrows():
        cells = []
        for c in cols:
            v = row[c]
            if isinstance(v, (float, np.floating)):
                cells.append("" if pd.isna(v) else f"{float(v):.4f}")
            else:
                cells.append(str(v))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def metrics_markdown(metrics: dict) -> str:
    lines = [
        "| slice | n | AUC LGBM | AUC formula | Δ AUC | logloss LGBM | logloss formula |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name in ("overall", "ADD", "PROPOSED", "FROZEN", "IN_PROGRESS"):
        b = metrics[name]
        n = b.get("n", "—")
        dlt = b["auc_lgbm"] - b["auc_formula"]
        ll_m = b.get("logloss_lgbm", float("nan"))
        ll_f = b.get("logloss_formula", float("nan"))
        lines.append(
            f"| {name} | {n} | {b['auc_lgbm']:.4f} | {b['auc_formula']:.4f} | {dlt:+.4f} | {ll_m:.4f} | {ll_f:.4f} |"
        )
    return "\n".join(lines)


def stage_completion_rates(df: pd.DataFrame) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for stage in ("CANDIDATE", "PROPOSED", "FROZEN", "IN_PROGRESS"):
        mask = df["stage"] == stage
        n = int(mask.sum())
        p = float((df.loc[mask, "label"] == "COMPLETED").mean()) if n else float("nan")
        out[stage] = {"n": n, "p_comp": p}
    return out


def stage_rates_markdown(rates: dict[str, dict]) -> str:
    lines = [
        "| stage | n | P(COMPLETED) |",
        "|---|---:|---:|",
    ]
    for name in ("CANDIDATE", "PROPOSED", "FROZEN", "IN_PROGRESS"):
        b = rates[name]
        lines.append(f"| {name} | {b['n']} | {b['p_comp']:.4f} |")
    return "\n".join(lines)


def write_report(
    path: Path,
    metrics: dict,
    calib: pd.DataFrame,
    shap_info: dict,
    oracle: dict,
    gates: list[tuple[str, bool, str]],
    best_iteration: int,
    stage_rates: dict[str, dict],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig = "figures"
    lines = [
        "# Ranker v1 — LightGBM vs formula baseline",
        "",
        f"- seed: `{SEED}`",
        f"- LightGBM: `{REQUIRED_LGBM}` (text format v3)",
        f"- LightGBM best_iteration: `{best_iteration}`",
        "",
        "## Gates",
        "",
        "| gate | status | detail |",
        "|---|---|---|",
    ]
    for name, ok, detail in gates:
        lines.append(f"| {name} | {'PASS' if ok else 'FAIL'} | {detail} |")
    lines += [
        "",
        "## AUC / log-loss",
        "",
        metrics_markdown(metrics),
        "",
        "## Stage completion (test)",
        "",
        stage_rates_markdown(stage_rates),
        "",
        "## Calibration",
        "",
        df_to_markdown(calib),
        "",
        f"![reliability]({fig}/reliability.png)",
        "",
        "## SHAP",
        "",
        f"Top-4: {', '.join(shap_info['top4'])}",
        "",
        f"reliability_mean mean|SHAP| share = {shap_info['reliability_share']:.4f}",
        "",
        f"![beeswarm]({fig}/shap_beeswarm.png)",
        "",
    ]
    plot_feats = shap_info.get("plot_feats") or shap_info["top4"]
    for feat in plot_feats:
        lines.append(f"![{feat}]({fig}/shap_dependence_{feat}.png)")
        lines.append("")
    lines += [
        "Визуальные проверки DGP: порог `min_edge` ≈ 0.35, пенальти `count=4`, насыщение `liquidity_min` на 1.0,",
        "взаимодействие `match_mean × liquidity_min`, почти нулевой вклад константной `reliability_mean`.",
        "",
        "### SHAP vs коэффициенты DGP",
        "",
        "| фича | роль в симуляторе | mean\\|SHAP\\| rank |",
        "|---|---|---:|",
    ]
    rank_of = {name: i + 1 for i, (name, _) in enumerate(shap_info["ranked"])}
    for feat, role in DGP_ROLES:
        lines.append(f"| `{feat}` | {role} | {rank_of.get(feat, '—')} |")
    lines += [
        "",
        "## Oracle (raw_json, не для обучения)",
        "",
        f"- errors: {oracle['n_err']} / {oracle['n']}",
        f"- P(error \\| fraud)={oracle['err_rate_fraud']:.4f}; P(error \\| ¬fraud)={oracle['err_rate_clean']:.4f}",
        f"- P(error \\| high \\|ε\\|)={oracle['err_rate_high_eps']:.4f}; P(error \\| lower \\|ε\\|)={oracle['err_rate_low_eps']:.4f}",
        f"- fraud share overall {oracle['fraud_rate_all']:.4f}; among errors {oracle['fraud_rate_err']:.4f}",
        f"- fraud cases: {oracle['n_fraud']}; fraud in errors: {oracle['n_fraud_err']}",
        f"- top error reasons: {oracle['reason_err']}",
        "",
        "`fraud` даёт +0.6 к `p_mismatch` на ПВЗ (reason `item_mismatch`) и редок (~3%).",
        "`no_show` — неотправка на ПВЗ после FROZEN, зависит от min(r). `|ε|` — шум размера кластера.",
        "Irreducible error: латентки `r`/`fraud` не входят в X.",
        "",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def export_artifacts(
    root: Path,
    model: lgb.LGBMClassifier,
    split: dict,
    p_test: np.ndarray,  # noqa: ARG001 — тот же контракт, что у ноутбука
    metrics: dict,
    calib: pd.DataFrame,
    shap_info: dict,
    oracle: dict,
    gates: list[tuple[str, bool, str]],
) -> dict[str, Path]:
    model_path = root / "backend" / "pkg" / "utils" / "ranker" / "models" / "ranker_v1.txt"
    golden_path = root / "ml" / "golden" / "golden_v1.json"
    report_path = root / "ml" / "reports" / "v1.md"
    fig_dir = root / "ml" / "reports" / "figures"

    model_path.parent.mkdir(parents=True, exist_ok=True)
    golden_path.parent.mkdir(parents=True, exist_ok=True)

    X_test = split["X_test"].reset_index(drop=True)
    pick = X_test.sample(n=min(N_GOLDEN, len(X_test)), random_state=SEED)

    tmp_model = model_path.with_name(model_path.name + ".tmp")
    try:
        model.booster_.save_model(str(tmp_model))
        reloaded = lgb.Booster(model_file=str(tmp_model))
        pred = reloaded.predict(pick)
        golden = []
        for (_, row), pr in zip(pick.iterrows(), pred):
            feats = {k: float(row[k]) for k in X_test.columns}
            golden.append({"features": feats, "proba": float(pr)})
        # JSON round-trip: то, что прочитает Go golden-тест
        loaded = json.loads(json.dumps(golden))
        Xg = pd.DataFrame([g["features"] for g in loaded])[list(X_test.columns)]
        pred2 = reloaded.predict(Xg)
        for g, pr in zip(loaded, pred2):
            if abs(g["proba"] - float(pr)) > 1e-5:
                raise AssertionError(
                    f"golden self-check failed: file={g['proba']:.8f} model={float(pr):.8f}"
                )
        tmp_model.replace(model_path)
        _assert_model_text_v3(model_path)
        golden = loaded
    except Exception:
        if tmp_model.exists():
            tmp_model.unlink()
        raise

    golden_path.write_text(json.dumps(golden, indent=2), encoding="utf-8")
    write_report(
        report_path,
        metrics,
        calib,
        shap_info,
        oracle,
        gates,
        int(getattr(model, "best_iteration_", 0) or 0),
        stage_completion_rates(split["df_test"]),
    )
    return {"model": model_path, "golden": golden_path, "report": report_path, "figures": fig_dir}


def _assert_model_text_v3(path: Path) -> None:
    header = path.read_text(encoding="utf-8").splitlines()[:8]
    if any(line.strip() == "version=v4" for line in header):
        raise AssertionError(f"{path} экспортирован как v4: {header}")
    if not any(line.strip() == "version=v3" for line in header):
        raise AssertionError(f"{path} без version=v3: {header}")


def run(root: Path | None = None) -> dict:
    set_seeds(SEED)
    assert_lightgbm_v3()
    root = find_root(root)
    fig_dir = root / "ml" / "reports" / "figures"
    fig_dir.mkdir(parents=True, exist_ok=True)

    manifest, df = load_contracts(root)
    X, y, formula = make_xy(df, manifest)
    split = stratified_split(df, X, y, formula, SEED)
    model = train_lgbm(split, SEED)
    p_test = model.predict_proba(split["X_test"])[:, 1]
    metrics = slice_metrics(split["df_test"], split["y_test"], p_test, split["formula_test"])
    calib = reliability_table(split["y_test"], p_test)
    plot_reliability(calib, fig_dir / "reliability.png")
    shap_info = shap_bundle(model, split["X_test"], fig_dir)
    oracle = oracle_analysis(split["df_test"], split["y_test"], p_test)
    gates = evaluate_gates(metrics, calib, shap_info)
    failed = [g for g in gates if not g[1]]
    if failed:
        details = "; ".join(f"{n}: {d}" for n, _, d in failed)
        raise RuntimeError(f"гейты не пройдены, артефакты не записаны: {details}")
    paths = export_artifacts(root, model, split, p_test, metrics, calib, shap_info, oracle, gates)
    return {"metrics": metrics, "gates": gates, "paths": paths, "shap": shap_info, "oracle": oracle}


if __name__ == "__main__":
    result = run()
    print("gates:")
    for name, ok, detail in result["gates"]:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    print("artifacts:", {k: str(v) for k, v in result["paths"].items()})
