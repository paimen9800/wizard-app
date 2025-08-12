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
        if ((s.account.password || "").length < 8) return "パス
// ここに前回作成したSetupWizardコンポーネントのコード全文を貼り付けてください
