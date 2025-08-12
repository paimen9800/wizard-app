import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";

const STEPS = [
  { key: "account", label: "アカウント" },
  { key: "company", label: "会社情報" },
  { key: "members", label: "役員・株主" },
  { key: "docs", label: "必要書類" },
  { key: "review", label: "確認・提出" },
] as const;

type WizardState = {
  currentIndex: number;
  savedAt?: string;
  dirty: boolean;
  saving: boolean;
  error?: string | null;
  data: {
    account: { email: string; password: string };
    company: { nameJa: string; nameEn: string; address: string };
    members: { ceo: string; directors: string };
    docs: { hankoReady: boolean; bankCert: boolean };
    review: { agree: boolean };
  };
};

type Action =
  | { type: "GOTO"; index: number }
  | { type: "CHANGE"; path: string; value: any }
  | { type: "SET_SAVING"; value: boolean }
  | { type: "SET_SAVED_AT"; value?: string }
  | { type: "SET_DIRTY"; value: boolean }
  | { type: "SET_ERROR"; value?: string | null }
  | { type: "HYDRATE"; state: Partial<WizardState> };

const initialState: WizardState = {
  currentIndex: 0,
  dirty: false,
  saving: false,
  error: null,
  data: {
    account: { email: "", password: "" },
    company: { nameJa: "", nameEn: "", address: "" },
    members: { ceo: "", directors: "" },
    docs: { hankoReady: false, bankCert: false },
    review: { agree: false },
  },
};

function set(obj: any, path: string, value: any) {
  const keys = path.split(".");
  const draft = { ...obj };
  let cur: any = draft;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return draft;
}

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "GOTO":
      return { ...state, currentIndex: action.index, error: null };
    case "CHANGE": {
      const nextData = set(state.data, action.path, action.value);
      return { ...state, data: nextData, dirty: true };
    }
    case "SET_SAVING":
      return { ...state, saving: action.value };
    case "SET_SAVED_AT":
      return { ...state, savedAt: action.value ?? new Date().toISOString(), dirty: false };
    case "SET_DIRTY":
      return { ...state, dirty: action.value };
    case "SET_ERROR":
      return { ...state, error: action.value ?? null };
    case "HYDRATE":
      return { ...state, ...action.state, data: { ...state.data, ...(action.state.data || {}) } };
    default:
      return state;
  }
}

// 疑似サーバー保存（本番はfetchでAPIへ）
async function fakeSaveToServer(payload: any) {
  await new Promise((r) => setTimeout(r, 600));
  if (Math.random() < 0.05) throw new Error("ネットワークエラー");
  return { ok: true } as const;
}

const STORAGE_KEY = "wizard:company-setup:v1";

export default function SetupWizard() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loaded, setLoaded] = useState(false);
  const step = STEPS[state.currentIndex];
  const progress = useMemo(
    () => Math.round(((state.currentIndex + 1) / STEPS.length) * 100),
    [state.currentIndex]
  );

  // 下書き読込
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        dispatch({ type: "HYDRATE", state: parsed });
      }
    } catch {}
    setLoaded(true);
  }, []);

  // 自動保存 1.5s
  const autoSaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (!state.dirty) return;

    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      saveDraft({ reason: "autosave" });
    }, 1500);
  }, [state.data, state.dirty, loaded]);

  // 未保存ガード
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (state.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.dirty]);

  function onChange(path: string, value: any) {
    dispatch({ type: "CHANGE", path, value });
  }

  async function saveDraft(opts?: { reason?: "manual" | "autosave" }) {
    dispatch({ type: "SET_SAVING", value: true });
    dispatch({ type: "SET_ERROR", value: null });
    const payload = { currentIndex: state.currentIndex, data: state.data };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, ...payload }));
      await fakeSaveToServer(payload);
      dispatch({ type: "SET_SAVED_AT" });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", value: e?.message || "保存に失敗しました" });
    } finally {
      dispatch({ type: "SET_SAVING", value: false });
      if (opts?.reason === "manual") dispatch({ type: "SET_DIRTY", value: false });
    }
  }

  function next() {
    if (state.currentIndex < STEPS.length - 1) dispatch({ type: "GOTO", index: state.currentIndex + 1 });
  }
  function prev() {
    if (state.currentIndex > 0) dispatch({ type: "GOTO", index: state.currentIndex - 1 });
  }

  function validateCurrent(): string | null {
    const s = state.data;
    switch (step.key) {
      case "account":
        if (!s.account.email) return "メールアドレスは必須です";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.account.email)) return "メール形式が不正です";
        if ((s.account.password || "").length < 8) return "パスワードは8文字以上";
        return null;
      case "company":
        if (!s.company.nameJa) return "商号（日本語）は必須です";
        if (!s.company.address) return "本店所在地は必須です";
        return null;
      case "members":
        if (!s.members.ceo) return "代表者氏名は必須です";
        return null;
      case "docs":
        if (!s.docs.hankoReady) return "印鑑の準備を完了してください";
        return null;
      case "review":
        if (!s.review.agree) return "規約同意が必要です";
        return null;
      default:
        return null;
    }
  }

  async function handleSaveAndContinue() {
    const err = validateCurrent();
    if (err) {
      dispatch({ type: "SET_ERROR", value: err });
      return;
    }
    await saveDraft({ reason: "manual" });
    next();
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  const savedLabel = state.savedAt
    ? new Date(state.savedAt).toLocaleString(undefined, { hour12: false })
    : "—";

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="mx-auto w-full max-w-4xl px-4 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">会社設立フロー（デモ）</h1>
        <p className="mt-1 text-sm text-slate-500">
          上部で進捗を可視化。各ステップは手動保存＆自動保存が可能です。
        </p>
      </header>

      {/* Progress */}
      <div className="mx-auto mt-6 w-full max-w-4xl px-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">進行率</div>
            <div className="text-xs text-slate-500">{progress}% 完了</div>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ol className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  className={
                    "w-full rounded-full px-2 py-1 " +
                    (i === state.currentIndex
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : i < state.currentIndex
                      ? "text-green-700"
                      : "text-slate-500")
                  }
                  onClick={() => dispatch({ type: "GOTO", index: i })}
                >
                  {i + 1}. {s.label}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Content Card */}
      <main className="mx-auto mt-6 w-full max-w-4xl px-4 pb-24">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{step.label}</h2>
            <div className="text-right text-xs text-slate-500">
              <div>{state.saving ? "保存中…" : state.dirty ? "未保存の変更あり" : "すべて保存済み"}</div>
              <div>最終保存: {savedLabel}</div>
            </div>
          </div>

          {state.error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="mt-6 space-y-6">
            {step.key === "account" && (
              <section className="space-y-4">
                <Field label="メールアドレス" hint="連絡用。ログインにも使用します">
                  <input
                    type="email"
                    className="input"
                    value={state.data.account.email}
                    onChange={(e) => onChange("data.account.email", e.target.value)}
                  />
                </Field>
                <Field label="パスワード" hint="8文字以上">
                  <input
                    type="password"
                    className="input"
                    value={state.data.account.password}
                    onChange={(e) => onChange("data.account.password", e.target.value)}
                  />
                </Field>
              </section>
            )}

            {step.key === "company" && (
              <section className="space-y-4">
                <Field label="商号（日本語）">
                  <input
                    className="input"
                    value={state.data.company.nameJa}
                    onChange={(e) => onChange("data.company.nameJa", e.target.value)}
                  />
                </Field>
                <Field label="商号（英語・任意）">
                  <input
                    className="input"
                    value={state.data.company.nameEn}
                    onChange={(e) => onChange("data.company.nameEn", e.target.value)}
                  />
                </Field>
                <Field label="本店所在地">
                  <input
                    className="input"
                    value={state.data.company.address}
                    onChange={(e) => onChange("data.company.address", e.target.value)}
                  />
                </Field>
              </section>
            )}

            {step.key === "members" && (
              <section className="space-y-4">
                <Field label="代表者氏名">
                  <input
                    className="input"
                    value={state.data.members.ceo}
                    onChange={(e) => onChange("data.members.ceo", e.target.value)}
                  />
                </Field>
                <Field label="取締役・株主（カンマ区切り）">
                  <textarea
                    className="input min-h-[90px]"
                    value={state.data.members.directors}
                    onChange={(e) => onChange("data.members.directors", e.target.value)}
                  />
                </Field>
              </section>
            )}

            {step.key === "docs" && (
              <section className="space-y-4">
                <Toggle
                  label="会社実印の準備ができた"
                  checked={state.data.docs.hankoReady}
                  onChange={(v) => onChange("data.docs.hankoReady", v)}
                />
                <Toggle
                  label="銀行の発行する残高証明の用意ができた"
                  checked={state.data.docs.bankCert}
                  onChange={(v) => onChange("data.docs.bankCert", v)}
                />
              </section>
            )}

            {step.key === "review" && (
              <section className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold">入力内容の確認</h3>
                  <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                    {JSON.stringify(state.data, null, 2)}
                  </pre>
                </div>
                <Toggle
                  label="利用規約に同意する"
                  checked={state.data.review.agree}
                  onChange={(v) => onChange("data.review.agree", v)}
                />
              </section>
            )}
          </div>

          {/* Footer Actions */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <button className="btn ghost" onClick={prev} disabled={state.currentIndex === 0}>
                戻る
              </button>
              <button className="btn" onClick={() => saveDraft({ reason: "manual" })} disabled={state.saving}>
                {state.saving ? "保存中…" : "このページを保存"}
              </button>
            </div>
            <div className="flex gap-2">
              <button className="btn danger" onClick={resetAll}>
                下書きをリセット
              </button>
              {state.currentIndex < STEPS.length - 1 ? (
                <button className="btn primary" onClick={handleSaveAndContinue}>
                  保存して次へ
                </button>
              ) : (
                <button className="btn primary" onClick={handleSaveAndContinue}>
                  同意して提出
                </button>
              )}
            </div>
          </div>
        </div>

        {loaded && (
          <div className="mt-4 text-center text-xs text-slate-500">
            下書きは自動保存されます。別デバイスでも使う場合はサーバー保存に切替えてください。
          </div>
        )}
      </main>

      {/* 注意: この @apply はTailwindのビルド対象CSSでは処理されません。最低限の装飾用。 */}
      <style>{`
        .input { @apply w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100; }
        .btn { @apply rounded-xl px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-black/5 transition; }
        .btn.primary { @apply bg-blue-600 text-white hover:bg-blue-700; }
        .btn.ghost { @apply bg-white hover:bg-slate-50; }
        .btn.danger { @apply bg-rose-50 text-rose-700 hover:bg-rose-100; }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={
        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm shadow-sm transition " +
        (checked ? "border-green-200 bg-green-50" : "border-slate-200 bg-white hover:bg-slate-50")
      }
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span>{label}</span>
      <span
        className={
          "inline-flex h-5 w-9 items-center rounded-full transition " +
          (checked ? "bg-green-500" : "bg-slate-300")
        }
      >
        <span
          className={
            "h-4 w-4 rounded-full bg-white shadow transition " +
            (checked ? "translate-x-4" : "translate-x-1")
          }
        />
      </span>
    </button>
  );
}
