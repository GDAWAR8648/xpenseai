// app.js
const { useState, useEffect, useRef } = React;

// Instead of: import { auth, db, storage } from "./firebase.config.js";

// Browser-storage-only mode: no Firebase, no Supabase configured right now.
const isFirebaseConfigured = false;
const firebaseAuth = null;
const firebaseDb = null;
const supabaseClient = null;
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";


function App() {
  const [tab, setTab] = useState("dashboard");
  const [expenses, setExpenses] = useState(() => loadExpenses());
  const [accounts, setAccounts] = useState(() => loadAccounts());
  const [storageReady, setStorageReady] = useState(true);
  const [smsText, setSmsText] = useState("");
  const [trackMode, setTrackMode] = useState("sms");
  const [manualForm, setManualForm] = useState({
    merchant: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    time: "",
    category: "Shopping",
    type: "debit",
    accountId: "__none__",
    note: ""
  });
  const setMF = (k, v) => setManualForm(prev => ({ ...prev, [k]: v }));
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [debugText, setDebugText] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState("");
  const [authProvider, setAuthProvider] = useState("firebase"); // now Firebase-only
  const [driveToken, setDriveToken] = useState(localStorage.getItem("drive_access_token") || "");
  const [autoSync, setAutoSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [editTxn, setEditTxn] = useState(null);
  const [editDirty, setEditDirty] = useState(false);
  const [autoSyncTimer, setAutoSyncTimer] = useState(null);
  const textRef = useRef();
  const expRef = useRef([]);
  const accRef = useRef([]);

  useEffect(() => { saveExpenses(expenses); }, [expenses]);
  useEffect(() => { saveAccounts(accounts); }, [accounts]);

  useEffect(() => {
    let cleanupFns = [];

    if (supabaseClient) {
      const initAuth = async () => {
        const { data } = await supabaseClient.auth.getSession();
        setUser(data?.session?.user ?? null);
        setSyncStatus(data?.session?.user ? "Supabase ready." : "Not signed in.");
      };
      initAuth();

      const { data: listener } = supabaseClient.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null);
        setSyncStatus(session?.user ? "Signed in." : "Signed out.");
      });
      cleanupFns.push(() => listener?.subscription?.unsubscribe?.());
    }

    if (firebaseAuth) {
      setUser(firebaseAuth.currentUser ?? null);
      const unsub = firebaseAuth.onAuthStateChanged((u) => {
        setUser(u ?? null);
        setSyncStatus(u ? "Firebase ready." : "Signed out.");
      });
      cleanupFns.push(() => unsub());

      if (firebaseAuth.isSignInWithEmailLink && firebaseAuth.isSignInWithEmailLink(window.location.href)) {
        (async () => {
          let email = localStorage.getItem('emailForSignIn') || "";
          if (!email) {
            email = window.prompt('Enter your email to complete Firebase sign-in:');
          }
          if (!email) {
            setSyncStatus('Firebase email link sign-in cancelled.');
            return;
          }
          try {
            await firebaseAuth.signInWithEmailLink(email, window.location.href);
            localStorage.removeItem('emailForSignIn');
            setSyncStatus('Signed in via Firebase email link.');
          } catch (err) {
            console.error('Firebase email link sign-in failed:', err);
            setSyncStatus('Firebase email link sign-in failed: ' + (err?.message || err));
          }
        })();
      }
    }

    return () => cleanupFns.forEach(fn => { try { fn(); } catch (e) {} });
  }, []);

  const toast_ = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const closeModal = () => { setModal(null); setEditTxn(null); setEditDirty(false); };

  const isSupabaseEnabled = () => Boolean(
    supabaseClient &&
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_") &&
    !SUPABASE_ANON_KEY.includes("YOUR_")
  );

  const syncPayload = () => ({ expenses, accounts });

  const signInWithMagicLink = async () => {
    if (!authEmail.trim()) {
      toast_("Enter your email before signing in.", "error");
      return;
    }
    setSyncStatus("Sending magic link…");
    // Firebase-only mode (Supabase fallback removed)
    if (!isFirebaseConfigured || !firebaseAuth) {
      toast_("Firebase config missing or not initialized. Check console for errors.", "error");
      setSyncStatus("Firebase not configured.");
      return;
    }
    try {
      console.log("Sending Firebase magic link to:", authEmail);
      const actionCodeSettings = { url: 'https://gdawar8648.github.io/xpenseai/', handleCodeInApp: true };
      await firebaseAuth.sendSignInLinkToEmail(authEmail, actionCodeSettings);
      // remember email to complete sign-in after redirect
      localStorage.setItem('emailForSignIn', authEmail);
      console.log("Firebase magic link sent successfully to:", authEmail);
      toast_("Check your email for the Firebase sign-in link.");
      setSyncStatus("Firebase magic link sent. Check your email.");
      return;
    } catch (err) {
      console.error('Firebase sendSignInLinkToEmail error:', err);
      console.error('Firebase error code:', err?.code);
      console.error('Firebase error message:', err?.message);
      toast_("Unable to send Firebase sign-in link: " + (err?.message || err), "error");
      setSyncStatus("Sign-in failed: " + (err?.message || err));
      return;
    }
  };

  const signOut = async () => {
    // sign out from whichever provider is active
    try {
      if (authProvider === "firebase" && firebaseAuth) {
        await firebaseAuth.signOut();
      }
      if (authProvider === "supabase" && supabaseClient && isSupabaseEnabled()) {
        await supabaseClient.auth.signOut();
      }
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    setUser(null);
    setSyncStatus("Signed out.");
    toast_("Signed out.");
  };

  const signInWithFirebaseGoogle = async () => {
    if (!isFirebaseConfigured || !firebaseAuth) { toast_("Firebase config missing.", "error"); return; }
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await firebaseAuth.signInWithPopup(provider);
      const fbUser = result.user;
      setUser(fbUser);
      setSyncStatus("Signed in with Google (Firebase).");
      toast_("Signed in.");
    } catch (err) {
      console.error('Firebase Google sign-in error:', err);
      toast_("Google sign-in failed: " + (err?.message || err), "error");
    }
  };

  const openDriveAuth = () => {
    const CLIENT_ID = ""; // paste your Google OAuth client id here
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
    const redirect = encodeURIComponent(window.location.origin);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&response_type=token&scope=${scope}&redirect_uri=${redirect}`;
    window.open(url, '_blank', 'width=600,height=700');
    toast_("Drive auth opened in a new window. If it completes, paste the access token into Drive settings.");
  };

  const saveDriveToken = (tok) => {
    setDriveToken(tok);
    localStorage.setItem('drive_access_token', tok);
    toast_("Drive access token saved.");
  };

  const downloadFromCloud = async () => {
    if (!user) { toast_("Sign in to download your cloud sync state.", "error"); return; }
    setIsSyncing(true);
    try {
      if (authProvider === "firebase") {
        if (!isFirebaseConfigured || !firebaseDb) { toast_("Firebase DB not configured.", "error"); setIsSyncing(false); return; }
        const uid = user.uid || user.id;
        const snap = await firebaseDb.ref(`user_states/${uid}`).once('value');
        const data = snap.val();
        setIsSyncing(false);
        if (!data) { toast_("No cloud state found yet. Upload your app state first.", "error"); return; }
        setExpenses(data.expenses || []);
        setAccounts(data.accounts || []);
        setSyncStatus(`Downloaded cloud state from Firebase.`);
        toast_("Cloud state downloaded from Firebase.");
        return;
      }

      if (authProvider === "drive") {
        // Drive uses access token stored in driveToken/localStorage
        const token = driveToken || localStorage.getItem('drive_access_token');
        if (!token) { toast_("No Drive access token set. Paste it in Drive settings.", "error"); setIsSyncing(false); return; }
        try {
          // Find file named xpenseai_sync.json in user's Drive appData or root
          const res = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D"xpenseai_sync.json"and trashed%3Dfalse&fields=files(id,name,modifiedTime)', { headers: { Authorization: `Bearer ${token}` } });
          const json = await res.json();
          if (!json.files || json.files.length === 0) { toast_("No Drive sync file found.", "error"); setIsSyncing(false); return; }
          const fileId = json.files[0].id;
          const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
          const payload = await contentRes.json();
          setIsSyncing(false);
          setExpenses(payload.expenses || []);
          setAccounts(payload.accounts || []);
          setSyncStatus(`Downloaded cloud state from Drive.`);
          toast_("Cloud state downloaded from Drive.");
          return;
        } catch (err) {
          console.error('Drive download error:', err);
          toast_("Drive download failed: " + (err?.message || err), "error");
          setIsSyncing(false);
          return;
        }
      }

      // default: supabase
      if (!isSupabaseEnabled()) { toast_("Supabase config is missing.", "error"); setIsSyncing(false); return; }
      const { data, error } = await supabaseClient
        .from("user_states")
        .select("payload, updated_at")
        .eq("user_id", user.id || user.uid)
        .single();
      setIsSyncing(false);

      if (error) {
        console.error(error);
        toast_("Unable to load cloud state.", "error");
        return;
      }
      if (!data?.payload) {
        toast_("No cloud state found yet. Upload your app state first.", "error");
        return;
      }
      setExpenses(data.payload.expenses || []);
      setAccounts(data.payload.accounts || []);
      setSyncStatus(`Downloaded cloud state from ${new Date(data.updated_at).toLocaleString()}.`);
      toast_("Cloud state downloaded.");
    } catch (err) {
      setIsSyncing(false);
      console.error(err);
      toast_("Download failed: " + (err?.message || err), "error");
    }
  };

  const uploadToCloud = async () => {
    if (!user) { toast_("Sign in to upload your cloud state.", "error"); return; }
    setIsSyncing(true);
    try {
      if (authProvider === "firebase") {
        if (!isFirebaseConfigured || !firebaseDb) { toast_("Firebase DB not configured.", "error"); setIsSyncing(false); return; }
        const uid = user.uid || user.id;
        await firebaseDb.ref(`user_states/${uid}`).set(syncPayload());
        setIsSyncing(false);
        setSyncStatus(`Uploaded cloud state to Firebase.`);
        toast_("Cloud state uploaded to Firebase.");
        return;
      }

      if (authProvider === "drive") {
        const token = driveToken || localStorage.getItem('drive_access_token');
        if (!token) { toast_("No Drive access token set. Paste it in Drive settings.", "error"); setIsSyncing(false); return; }
        try {
          // create or update a file named xpenseai_sync.json in Drive
          const payload = syncPayload();
          // try find existing file
          const findRes = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D"xpenseai_sync.json"and trashed%3Dfalse&fields=files(id,name)', { headers: { Authorization: `Bearer ${token}` } });
          const findJson = await findRes.json();
          let fileId = findJson.files && findJson.files[0] && findJson.files[0].id;
          if (fileId) {
            // update
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          } else {
            // create
            const meta = { name: 'xpenseai_sync.json' };
            const form = new FormData();
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
            form.append('file', blob);
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
          }
          setIsSyncing(false);
          setSyncStatus('Uploaded cloud state to Drive.');
          toast_('Cloud state uploaded to Drive.');
          return;
        } catch (err) {
          console.error('Drive upload error:', err);
          toast_('Drive upload failed: ' + (err?.message || err), 'error');
          setIsSyncing(false);
          return;
        }
      }

      // default: supabase
      if (!isSupabaseEnabled()) { toast_("Supabase config is missing.", "error"); setIsSyncing(false); return; }
      const { data, error } = await supabaseClient
        .from("user_states")
        .upsert({ user_id: user.id || user.uid, payload: syncPayload(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      setIsSyncing(false);

      if (error) {
        console.error("Supabase upload error:", error);
        const msg = error?.message || (error?.details ? JSON.stringify(error.details) : "Unable to upload cloud state.");
        toast_(msg, "error");
        setSyncStatus("Upload failed.");
        return;
      }
      setSyncStatus(`Uploaded cloud state at ${new Date().toLocaleString()}.`);
      toast_("Cloud state uploaded.");
    } catch (err) {
      setIsSyncing(false);
      console.error("Upload exception:", err);
      toast_("Upload failed: " + (err?.message || err), "error");
      setSyncStatus("Upload failed.");
    }
  };

  useEffect(() => {
    if (!user || !autoSync || !isSupabaseEnabled()) return;
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
    }
    setSyncStatus("Auto sync queued…");
    const timer = setTimeout(() => {
      uploadToCloud();
    }, 1200);
    setAutoSyncTimer(timer);
    return () => clearTimeout(timer);
  }, [expenses, accounts, autoSync, user]);

  const openTxnDetail = (exp) => {
    setEditTxn({
      merchant: exp.merchant || "",
      category: exp.category || "Other",
      type: exp.type || "debit",
      accountId: accounts.find(a =>
        norm4(a.accountRef) === norm4(exp.accountRef) ||
        norm4(a.accountRef) === norm4(exp.card)
      )?.id || "__none__",
      amount: exp.amount || 0,
      note: exp.note || "",
    });
    setEditDirty(false);
    setModal({ type: "txnDetail", exp });
  };

  const applyBillPayment = (txnId, creditCardAccId) => {
    const ccAcc = accounts.find(a => a.id === creditCardAccId);
    const txn = expenses.find(e => e.id === txnId);
    if (!ccAcc || !txn) return;

    setExpenses(prev => prev.map(e => e.id === txnId
      ? { ...e, category: "Bills", billPayment: true, billPaymentTo: creditCardAccId, type: "debit" }
      : e
    ));

    const payment = txn.amount || 0;
    const newAvail = Math.min(
      Number(ccAcc.totalLimit || 0),
      Number(ccAcc.availableLimit || 0) + payment
    );
    const newLastDue = Math.max(0, Number(ccAcc.lastAmtDue || 0) - payment);
    const newCurrentDue = Math.max(0, Number(ccAcc.currentAmtDue || 0) - payment);
    const newOutstanding = Math.max(0, Number(ccAcc.totalOutstanding || 0) - payment);

    setAccounts(prev => prev.map(a => a.id === creditCardAccId
      ? {
          ...a,
          availableLimit: newAvail.toFixed(2),
          lastAmtDue: newLastDue.toFixed(2),
          currentAmtDue: newCurrentDue.toFixed(2),
          totalOutstanding: newOutstanding.toFixed(2)
        }
      : a
    ));

    toast_(`✅ ₹${fmtINR(payment)} applied to ${ccAcc.name}. Limit restored.`);
    closeModal();
  };

  const handleManualAdd = () => {
    const { merchant, amount, date, time, category, type, accountId, note } = manualForm;
    if (!merchant.trim() || !amount || isNaN(Number(amount))) {
      toast_("Please enter at least a merchant and amount.", "error");
      return;
    }
    const chosen = accounts.find(a => a.id === accountId);
    const dateISO = date ? new Date(`${date}T${time || "00:00:00"}`).toISOString() : new Date().toISOString();
    const id = Date.now().toString();
    const newExp = {
      id,
      merchant: merchant.trim(),
      amount: Number(amount),
      currency: "INR",
      category,
      type,
      isExpense: type !== "credit",
      date: dateISO,
      addedAt: new Date().toISOString(),
      note,
      accountRef: chosen ? norm4(chosen.accountRef) : "",
      card: chosen ? `${chosen.bankName || ""} ${chosen.type === "credit" ? "Card" : "A/c"} ••${chosen.accountRef}`.trim() : "",
      manualEntry: true,
    };
    setExpenses(prev => [newExp, ...prev]);
    setManualForm({ merchant: "", amount: "", date: new Date().toISOString().slice(0, 10), time: "", category: "Shopping", type: "debit", accountId: "__none__", note: "" });
    toast_(`✅ ₹${fmtINR(Number(amount))} at ${merchant.trim()} added!`);
  };

  const handleTrack = async () => {
    if (!smsText.trim() || loading) return;
    setLoading(true);
    const msgs = splitSMS(smsText);
    setLoadMsg(`Parsing ${msgs.length} message${msgs.length > 1 ? "s" : ""}…`);
    let parsed = [];
    try { const ai = await parseViaAI(msgs); if (ai && Array.isArray(ai)) parsed = ai; } catch {}
    if (parsed.length !== msgs.length) parsed = msgs.map((m, i) => parsed[i] || regexParse(m));
    else parsed = parsed.map((p, i) => (p && p.amount) ? p : regexParse(msgs[i]));

    const now = Date.now();
    const valid = parsed.map((p, i) => p && p.amount && p.isExpense !== false ? {
      id: (now + i).toString(), ...p,
      accountRef: norm4(p.accountRef) || norm4(p.card) || "",
      isExpense: p.type !== "credit",
      rawMessage: msgs[i],
      addedAt: new Date().toISOString()
    } : null).filter(Boolean);

    if (!valid.length) {
      toast_("No expenses found.", "error");
      setLoading(false);
      setLoadMsg("");
      return;
    }

    setExpenses(prev => [...valid, ...prev]);
    setSmsText("");
    toast_(`✅ ${valid.length} transaction${valid.length > 1 ? "s" : ""} tracked!`);
    setLoading(false);
    setLoadMsg("");
  };

  const getBackupSnapshot = () => JSON.stringify({ expenses, accounts }, null, 2);
  const copyBackupSnapshot = () => {
    const snapshot = getBackupSnapshot();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(snapshot).then(() => toast_("Backup copied to clipboard."), () => toast_("Copy failed. Paste manually.", "error"));
    } else {
      window.prompt("Copy this backup text:", snapshot);
    }
  };

  const decodeBackupText = (text) => {
    try {
      return JSON.parse(text);
    } catch (jsonErr) {
      try {
        const cleaned = text.replace(/\s+/g, "");
        const decoded = atob(cleaned.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(decoded);
      } catch (baseErr) {
        throw new Error("Unable to parse backup as JSON or base64 JSON.");
      }
    }
  };

  const restoreBackupSnapshot = () => {
    const text = debugText.trim();
    if (!text) {
      toast_("Paste a saved JSON backup before restoring.", "error");
      return;
    }
    try {
      const parsed = decodeBackupText(text);
      if (!Array.isArray(parsed.expenses) || !Array.isArray(parsed.accounts)) throw new Error("Invalid state payload");
      setExpenses(parsed.expenses);
      setAccounts(parsed.accounts);
      toast_("State restored from debug backup.");
    } catch (err) {
      console.error(err);
      toast_("Invalid backup format. Paste a valid JSON export or base64 payload.", "error");
    }
  };

  const debits = expenses.filter(e => e.type !== "credit");
  const credits = expenses.filter(e => e.type === "credit");
  const totalDebit = debits.reduce((s, e) => s + (e.amount || 0), 0);
  const totalCredit = credits.reduce((s, e) => s + (e.amount || 0), 0);
  const netFlow = totalCredit - totalDebit;

  const byCategory = debits.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {});
  const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

  const monthlyFlow = (() => {
    const map = {};
    expenses.forEach(e => {
      const d = new Date(e.date || e.addedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) map[key] = { label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), debit: 0, credit: 0 };
      if (e.type === "credit") map[key].credit += e.amount || 0;
      else map[key].debit += e.amount || 0;
    });
    return Object.entries(map).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([, v]) => v);
  })();

  const getAccountExpenses = (acc) => {
    const last4 = norm4(acc.accountRef);
    if (!last4) return [];
    return expenses.filter(e => {
      const eRef = norm4(e.accountRef);
      const eCard = norm4(e.card);
      return eRef === last4 || eCard === last4;
    });
  };

  const getSavingsStats = (acc) => {
    const txns = getAccountExpenses(acc);
    const netOutflow = txns.filter(e => e.type !== "credit").reduce((s, e) => s + (e.amount || 0), 0);
    const netInflow = txns.filter(e => e.type === "credit").reduce((s, e) => s + (e.amount || 0), 0);
    const initialBalance = Number(acc.initialBalance || acc.balance || 0);
    const availableBalance = initialBalance - netOutflow + netInflow;
    return { txns, netOutflow, netInflow, initialBalance, availableBalance };
  };

  const getCCStats = (acc) => {
    const txns = getAccountExpenses(acc);
    const txnSpend = txns.filter(e => e.type !== "credit").reduce((s, e) => s + (e.amount || 0), 0);
    const txnPayments = txns.filter(e => e.type === "credit").reduce((s, e) => s + (e.amount || 0), 0);
    const totalLimit = Number(acc.totalLimit || 0);
    const setAvail = Number(acc.availableLimit || 0);

    let computedAvailable = 0, outstanding = 0;
    if (totalLimit > 0 && setAvail > 0) {
      computedAvailable = Math.max(0, setAvail - txnSpend + txnPayments);
      outstanding = Math.max(0, totalLimit - computedAvailable);
    } else if (totalLimit > 0) {
      computedAvailable = Math.max(0, totalLimit - txnSpend + txnPayments);
      outstanding = Math.max(0, totalLimit - computedAvailable);
    } else {
      outstanding = Math.max(0, txnSpend - txnPayments);
    }

    const stmtDay = parseInt(acc.statementDate || "0");
    const graceDays = parseInt(acc.gracePeriod || "20");
    const today = new Date();
    const todayDay = today.getDate();

    let currentStmtStart = null;
    let currentStmtEnd = null;
    let nextDueDate = null;
    let lastStmtStart = null;
    let lastStmtEnd = null;

    if (stmtDay > 0) {
      const yr = today.getFullYear();
      const mo = today.getMonth();

      if (todayDay >= stmtDay) {
        currentStmtStart = new Date(yr, mo, stmtDay);
        currentStmtEnd = new Date(yr, mo + 1, stmtDay);
        lastStmtStart = new Date(yr, mo - 1, stmtDay);
        lastStmtEnd = new Date(yr, mo, stmtDay);
      } else {
        currentStmtStart = new Date(yr, mo - 1, stmtDay);
        currentStmtEnd = new Date(yr, mo, stmtDay);
        lastStmtStart = new Date(yr, mo - 2, stmtDay);
        lastStmtEnd = new Date(yr, mo - 1, stmtDay);
      }

      nextDueDate = new Date(currentStmtEnd.getTime() + graceDays * 86400000);
    }

    const currentPeriodTxns = stmtDay > 0
      ? txns.filter(e => {
          if (e.type === "credit") return false;
          const d = new Date(e.date || e.addedAt);
          return d >= currentStmtStart && d < currentStmtEnd;
        })
      : txns.filter(e => e.type !== "credit");

    const currentStmtDue = currentPeriodTxns.reduce((s, e) => s + (e.amount || 0), 0);

    const lastPeriodTxns = stmtDay > 0
      ? txns.filter(e => {
          if (e.type === "credit") return false;
          const d = new Date(e.date || e.addedAt);
          return d >= lastStmtStart && d < lastStmtEnd;
        })
      : [];
    const lastStmtDue = lastPeriodTxns.reduce((s, e) => s + (e.amount || 0), 0);

    const lastAmtDue = Number(acc.lastAmtDue || 0) || lastStmtDue;
    const lastDueDate = lastStmtEnd ? new Date(lastStmtEnd.getTime() + graceDays * 86400000) : null;

    return {
      txns,
      txnSpend,
      txnPayments,
      totalLimit,
      computedAvailable,
      outstanding,
      currentStmtDue,
      lastAmtDue,
      lastStmtDue,
      currentPeriodTxns,
      lastPeriodTxns,
      currentStmtStart,
      currentStmtEnd,
      lastStmtStart,
      lastStmtEnd,
      nextDueDate,
      lastDueDate,
      stmtDay,
      graceDays
    };
  };

  const getSharedLimitGroups = () => {
    const ccCards = accounts.filter(a => a.type === "credit" && a.sharedLimit && a.bankName);
    const groups = {};
    ccCards.forEach(card => {
      const key = card.bankName;
      if (!groups[key]) groups[key] = { bank: key, cards: [], poolLimit: 0, poolSetAvail: 0, totalTxnSpend: 0, totalTxnPayments: 0 };
      const g = groups[key];
      g.cards.push(card);
      const lim = Number(card.totalLimit || 0);
      if (lim > g.poolLimit) g.poolLimit = lim;
      const avail = Number(card.availableLimit || 0);
      if (avail > g.poolSetAvail) g.poolSetAvail = avail;
      const stats = getCCStats(card);
      g.totalTxnSpend += stats.txnSpend;
      g.totalTxnPayments += stats.txnPayments;
    });
    Object.values(groups).forEach(g => {
      if (g.poolSetAvail > 0) {
        g.poolAvailable = Math.max(0, g.poolSetAvail - g.totalTxnSpend + g.totalTxnPayments);
      } else if (g.poolLimit > 0) {
        g.poolAvailable = Math.max(0, g.poolLimit - g.totalTxnSpend + g.totalTxnPayments);
      } else {
        g.poolAvailable = 0;
      }
      g.poolOutstanding = Math.max(0, g.poolLimit - g.poolAvailable);
    });
    return Object.values(groups);
  };

  const sharedLimitGroups = getSharedLimitGroups();

  const totalSavingsBalance = accounts
    .filter(a => a.type === "savings")
    .reduce((s, a) => s + getSavingsStats(a).availableBalance, 0);

  const totalCCDues = (() => {
    let total = 0;
    const countedPools = new Set();
    accounts.filter(a => a.type === "credit").forEach(a => {
      if (a.sharedLimit && a.bankName) {
        if (!countedPools.has(a.bankName)) {
          const group = sharedLimitGroups.find(g => g.bank === a.bankName);
          if (group) { total += group.poolOutstanding; countedPools.add(a.bankName); }
        }
      } else {
        total += getCCStats(a).outstanding;
      }
    });
    return total;
  })();

  const netWorth = totalSavingsBalance - totalCCDues;

  const [accForm, setAccForm] = useState({
    name: "",
    type: "savings",
    bankName: "",
    network: "Visa",
    sharedLimit: false,
    sharedLimitGroup: "",
    totalLimit: "",
    availableLimit: "",
    statementDate: "",
    gracePeriod: "20",
    dueDate: "",
    lastAmtDue: "",
    currentAmtDue: "",
    emiCount: "",
    totalOutstanding: "",
    balance: "",
    initialBalance: "",
    accountRef: ""
  });
  const setAF = (k, v) => setAccForm(f => ({ ...f, [k]: v }));

  const saveAccount = () => {
    const id = accForm.id || Date.now().toString();
    setAccounts(prev => {
      const existing = prev.findIndex(a => a.id === id);
      const updated = { ...accForm, id };
      return existing >= 0 ? prev.map(a => a.id === id ? updated : a) : [...prev, updated];
    });
    closeModal();
    toast_("Account saved!");
  };

  const openAddAccount = (type) => {
    setAccForm({
      id: null,
      name: "",
      type,
      bankName: "",
      network: "Visa",
      sharedLimit: false,
      sharedLimitGroup: "",
      totalLimit: "",
      availableLimit: "",
      statementDate: "",
      gracePeriod: "20",
      dueDate: "",
      lastAmtDue: "",
      currentAmtDue: "",
      emiCount: "",
      totalOutstanding: "",
      balance: "",
      initialBalance: "",
      accountRef: ""
    });
    setModal({ type: "addAccount" });
  };

  const openEditAccount = (acc) => {
    setAccForm({ ...acc });
    setModal({ type: "addAccount" });
  };

  const clearAllAccounts = () => {
    if (accounts.length === 0) {
      toast_("No accounts to remove.", "error");
      return;
    }
    if (!confirm("Remove all saved accounts? This will keep your transaction history but clear all account records.")) {
      return;
    }
    setAccounts([]);
    toast_("All accounts removed.");
  };

  const TABS = [
    { id: "dashboard", label: "📊 Dashboard" },
    { id: "accounts", label: "🏦 Accounts" },
    { id: "insights", label: "🔍 Insights" },
    { id: "history", label: `🧾 History (${expenses.length})` },
    { id: "track", label: "➕ Track" },
    { id: "debug", label: "🛠️ Debug" },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", minHeight: "100vh", background: "#0c0c18", color: "#e2e2f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&family=Syne:wght@600;700;800&display=swap');
      `}</style>

      {toast && <div style={{ position: "fixed", top: "16px", right: "16px", zIndex: 500, background: toast.type === "error" ? "rgba(255,107,107,0.15)" : "rgba(0,212,132,0.15)", border: `1px solid ${toast.type === "error" ? "rgba(255,107,107,0.4)" : "rgba(0,212,132,0.4)"}`, color: toast.type === "error" ? "#ff6b6b" : "#00d484", padding: "11px 18px", borderRadius: "12px", fontSize: "13px", backdropFilter: "blur(10px)", animation: "slideIn .25s ease", maxWidth: "300px" }}>{toast.msg}</div>}

      {!storageReady && (
        <div style={{ position: "fixed", inset: 0, background: "#0c0c18", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "32px" }}>💳</div>
          <div style={{ fontSize: "13px", color: "#555" }}>Loading XpenseAI…</div>
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px", overflowX: "hidden", paddingTop: "4px", paddingBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: "800", fontSize: "15px", color: "#7c6ef5", whiteSpace: "nowrap", paddingBottom: "4px" }}>💳 XpenseAI</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, color: "#aaa", fontSize: "12px", flexWrap: "wrap" }}>
            <span style={{ background: "rgba(124,110,245,0.12)", border: "1px solid rgba(124,110,245,0.2)", borderRadius: "999px", padding: "5px 10px", color: "#7c6ef5", fontWeight: 600 }}>{user ? "Signed in" : "Signed out"}</span>
            <span style={{ background: "rgba(0,212,132,0.08)", border: "1px solid rgba(0,212,132,0.15)", borderRadius: "999px", padding: "5px 10px", color: autoSync ? "#00d484" : "#aaa", fontWeight: 600 }}>{autoSync ? "Auto sync on" : "Auto sync off"}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 16px" }}>
        {tab === "dashboard" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(124,110,245,0.15),rgba(0,212,132,0.08))", border: "1px solid rgba(124,110,245,0.25)", borderRadius: "20px", padding: "20px 22px", marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Net Balance</div>
              <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "28px", fontWeight: "700", color: netWorth >= 0 ? "#00d484" : "#ff6b6b", marginBottom: "14px", letterSpacing: "-1px" }}>
                {netWorth >= 0 ? "+" : ""}₹{fmtINR(netWorth)}
              </div>

              {accounts.filter(a => a.type === "savings").length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "10px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Savings Accounts</div>
                  {accounts.filter(a => a.type === "savings").map(a => {
                    const { availableBalance } = getSavingsStats(a);
                    return (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ color: "#aaa" }}>{a.name} {a.accountRef ? "••" + a.accountRef : ""}</span>
                        <span style={{ fontFamily: "'Space Mono',monospace", color: "#00d484", fontWeight: "600" }}>+₹{fmtINR(availableBalance)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "5px 0", marginTop: "2px" }}>
                    <span style={{ color: "#555", fontWeight: "700" }}>Total Savings</span>
                    <span style={{ fontFamily: "'Space Mono',monospace", color: "#00d484", fontWeight: "700" }}>+₹{fmtINR(totalSavingsBalance)}</span>
                  </div>
                </div>
              )}

              {accounts.filter(a => a.type === "credit").length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px" }}>
                  <div style={{ fontSize: "10px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Credit Card Outstanding</div>
                  {sharedLimitGroups.map(g => (
                    <div key={g.bank} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ color: "#aaa" }}>🔗 {g.bank} Pool <span style={{ color: "#555", fontSize: "10px" }}>({g.cards.length} cards)</span></span>
                      <span style={{ fontFamily: "'Space Mono',monospace", color: g.poolOutstanding > 0 ? "#ff6b6b" : "#00d484", fontWeight: "600" }}>{g.poolOutstanding > 0 ? "-" : ""}₹{fmtINR(g.poolOutstanding)}</span>
                    </div>
                  ))}
                  {accounts.filter(a => a.type === "credit" && !a.sharedLimit).map(a => {
                    const { outstanding } = getCCStats(a);
                    return (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ color: "#aaa" }}>{a.name} {a.accountRef ? "••" + a.accountRef : ""}</span>
                        <span style={{ fontFamily: "'Space Mono',monospace", color: outstanding > 0 ? "#ff6b6b" : "#00d484", fontWeight: "600" }}>{outstanding > 0 ? "-" : ""}₹{fmtINR(outstanding)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "5px 0", marginTop: "2px" }}>
                    <span style={{ color: "#555", fontWeight: "700" }}>Total CC Dues</span>
                    <span style={{ fontFamily: "'Space Mono',monospace", color: totalCCDues > 0 ? "#ff6b6b" : "#00d484", fontWeight: "700" }}>{totalCCDues > 0 ? "-" : ""}₹{fmtINR(totalCCDues)}</span>
                  </div>
                </div>
              )}

              {accounts.length === 0 && (
                <div style={{ fontSize: "11px", color: "#444" }}>Add savings and credit card accounts to see your net balance.</div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "16px" }}>
              {[
                { label: "Total Debited", value: `₹${fmtINR(totalDebit)}`, color: "#ff6b6b", mono: true },
                { label: "Total Credited", value: `₹${fmtINR(totalCredit)}`, color: "#00d484", mono: true },
                { label: "Net Flow", value: `${netFlow >= 0 ? "+" : ""}₹${fmtINR(Math.abs(netFlow))}`, color: netFlow >= 0 ? "#00d484" : "#ff6b6b", mono: true }
              ].map((s, i) => (
                <div key={i} className="card" style={{ borderColor: `${s.color}22` }}>
                  <div style={{ fontSize: "10px", color: "#555", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>{s.label}</div>
                  <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "13px", fontWeight: "700", color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {monthlyFlow.length > 0 && (
              <div className="card" style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "14px" }}>Cash Flow</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", height: "90px", overflowX: "auto" }}>
                  {monthlyFlow.map((m, i) => {
                    const maxVal = Math.max(...monthlyFlow.map(x => Math.max(x.debit, x.credit)), 1);
                    return (
                      <div key={i} style={{ flex: "0 0 auto", minWidth: "44px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "70px", justifyContent: "center" }}>
                          <div title={`Debit ₹${fmtINR(m.debit)}`} style={{ width: "14px", background: "#ff6b6b88", borderRadius: "3px 3px 0 0", height: `${(m.debit / maxVal) * 70}px`, minHeight: m.debit ? "2px" : "0" }} />
                          <div title={`Credit ₹${fmtINR(m.credit)}`} style={{ width: "14px", background: "#00d48488", borderRadius: "3px 3px 0 0", height: `${(m.credit / maxVal) * 70}px`, minHeight: m.credit ? "2px" : "0" }} />
                        </div>
                        <div style={{ fontSize: "9px", color: "#444", marginTop: "4px" }}>{m.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
                  {[ ["#ff6b6b", "Debit"], ["#00d484", "Credit"] ].map(([c, l]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#666" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: c + "88" }} />{l}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(byCategory).length > 0 && (
              <div className="card" style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "14px" }}>Spending by Category</div>
                {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                  const pct = (amt / totalDebit) * 100;
                  return (
                    <div key={cat} style={{ marginBottom: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "13px" }}>
                        <span>{CAT_ICON[cat]} {cat}</span>
                        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: "11px", color: CAT_COLOR[cat] }}>₹{fmtINR(amt)} <span style={{ color: "#444" }}>({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div style={{ height: "3px", background: "rgba(255,255,255,0.05)", borderRadius: "2px" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: CAT_COLOR[cat], borderRadius: "2px", transition: "width .5s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(() => {
              const ccAccounts = accounts.filter(a => a.type === "credit" && a.statementDate);
              if (ccAccounts.length === 0) return null;

              const dueItems = ccAccounts.map(acc => {
                const cs = getCCStats(acc);
                return {
                  id: acc.id,
                  name: acc.name || "Credit Card",
                  accountRef: acc.accountRef ? "••" + acc.accountRef : "",
                  bankName: acc.bankName || "",
                  isPool: !!acc.sharedLimit,
                  lastAmtDue: cs.lastAmtDue,
                  currentStmtDue: cs.currentStmtDue,
                  lastDueDate: cs.lastDueDate,
                  nextDueDate: cs.nextDueDate,
                  lastStmtStart: cs.lastStmtStart,
                  lastStmtEnd: cs.lastStmtEnd,
                  currentStmtStart: cs.currentStmtStart,
                  currentStmtEnd: cs.currentStmtEnd,
                };
              });

              const daysUntil = (d) => d ? Math.ceil((d - new Date()) / 86400000) : null;
              const fmtShort = (d) => d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
              const fmtPeriod = (s, e) => s && e ? `${s.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${e.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : "";
              const getSortBucket = (d) => {
                if (!d.lastDueDate) return 2;
                const days = daysUntil(d.lastDueDate);
                if (days < 0) return 0;
                return 1;
              };
              dueItems.sort((a, b) => {
                const ba = getSortBucket(a), bb = getSortBucket(b);
                if (ba !== bb) return ba - bb;
                const da = a.lastDueDate || a.nextDueDate;
                const db = b.lastDueDate || b.nextDueDate;
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return da - db;
              });

              const totalLastStmtDue = dueItems.reduce((s, d) => s + (d.lastAmtDue || 0), 0);
              const totalCurrentDue = dueItems.reduce((s, d) => s + (d.currentStmtDue || 0), 0);

              return (
                <div className="card" style={{ marginBottom: "16px", borderColor: "rgba(255,215,0,0.2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                    <div style={{ fontSize: "11px", color: "#FFD93D", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px" }}>💳 Card Dues</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "13px", fontWeight: "700", color: "#ff6b6b" }}>₹{fmtINR(totalLastStmtDue)}</div>
                      <div style={{ fontSize: "9px", color: "#555" }}>last stmt total due</div>
                      {totalCurrentDue > 0 && <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "11px", color: "#888", marginTop: "2px" }}>+₹{fmtINR(totalCurrentDue)} accruing</div>}
                    </div>
                  </div>

                  {dueItems.map(d => {
                    const days = daysUntil(d.lastDueDate);
                    const overdue = days !== null && days < 0;
                    const urgent = days !== null && days >= 0 && days <= 5;
                    const soon = days !== null && days > 5 && days <= 10;
                    const color = overdue ? "#ff6b6b" : urgent ? "#ff6b6b" : soon ? "#FFD93D" : "#aaa";
                    const icon = overdue ? "🔴" : urgent ? "🔴" : soon ? "🟡" : "📅";
                    return (
                      <div key={d.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: "600", fontSize: "13px" }}>
                              {d.name}
                              <span style={{ color: "#555", fontSize: "10px", marginLeft: "5px" }}>{d.accountRef}</span>
                              {d.isPool && <span style={{ color: "#7c6ef5", fontSize: "9px", marginLeft: "5px" }}>🔗</span>}
                            </div>
                            {d.lastStmtStart && d.lastStmtEnd && (
                              <div style={{ fontSize: "10px", color: "#555", marginTop: "1px" }}>
                                Last stmt: {fmtPeriod(d.lastStmtStart, d.lastStmtEnd)}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "14px", fontWeight: "700", color: "#ff6b6b" }}>₹{fmtINR(d.lastAmtDue)}</div>
                            <div style={{ fontSize: "9px", color: "#555" }}>last stmt due</div>
                            {d.currentStmtDue > 0 && (
                              <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "10px", color: "#888", marginTop: "1px" }}>+₹{fmtINR(d.currentStmtDue)} accruing</div>
                            )}
                          </div>
                        </div>
                        {getSortBucket(d) === 2 ? (
                          <div style={{ marginTop: "5px" }}>
                            <div style={{ fontSize: "10px", color: "#555" }}>📅 Next statement generates: {fmtShort(d.currentStmtEnd)}</div>
                            {d.currentStmtStart && d.currentStmtEnd && (
                              <div style={{ fontSize: "9px", color: "#444", marginTop: "2px" }}>Accruing: {fmtPeriod(d.currentStmtStart, d.currentStmtEnd)} · ₹{fmtINR(d.currentStmtDue)}</div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "5px" }}>
                              <div style={{ fontSize: "10px", color: color, fontWeight: overdue || urgent ? "700" : "400" }}>{icon} Pay by {fmtShort(d.lastDueDate)}</div>
                              {days !== null && (
                                <div style={{ fontSize: "10px", color: color, fontWeight: "700" }}>{overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}</div>
                              )}
                            </div>
                            {d.currentStmtStart && d.currentStmtEnd && (
                              <div style={{ fontSize: "9px", color: "#444", marginTop: "3px" }}>Accruing: {fmtPeriod(d.currentStmtStart, d.currentStmtEnd)} · ₹{fmtINR(d.currentStmtDue)}</div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {expenses.length === 0 && (
              <div style={{ textAlign: "center", color: "#333", padding: "60px 0" }}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>📭</div>
                <p style={{ margin: 0, fontSize: "14px" }}>No transactions yet — go to Track to add some.</p>
              </div>
            )}
          </div>
        )}

        {tab === "accounts" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: "18px" }}>Accounts</h2>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="btn-ghost" onClick={() => openAddAccount("savings")}>+ Savings</button>
                <button className="btn-ghost" onClick={() => openAddAccount("credit")}>+ Credit Card</button>
                {accounts.length > 0 && (
                  <button className="btn-ghost" onClick={clearAllAccounts} style={{ color: "#ff8d8d", borderColor: "rgba(255,107,107,0.25)" }}>
                    Remove all accounts
                  </button>
                )}
              </div>
            </div>

            {accounts.length === 0 && (
              <div style={{ textAlign: "center", color: "#333", padding: "50px 0" }}>
                <div style={{ fontSize: "40px", marginBottom: "10px" }}>🏦</div>
                <p style={{ margin: 0, fontSize: "14px" }}>No accounts yet.</p>
              </div>
            )}

            {accounts.filter(a => a.type === "credit").length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "8px" }}>Credit Cards</div>
                <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", overflow: "hidden" }}>
                  {accounts.filter(a => a.type === "credit").map((acc, i, arr) => {
                    const cs = getCCStats(acc);
                    const sg = acc.sharedLimit && acc.bankName ? sharedLimitGroups.find(g => g.bank === acc.bankName) : null;
                    const due = sg ? sg.poolOutstanding : cs.outstanding;
                    const lim = sg ? sg.poolLimit : cs.totalLimit;
                    const pct = lim > 0 ? Math.min((due / lim) * 100, 100) : 0;
                    return (
                      <div key={acc.id} onClick={() => setModal({ type: "accDetail", acc })} className="row-hover" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", cursor: "pointer" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(124,110,245,0.15)", border: "1px solid rgba(124,110,245,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>💳</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.name || "Credit Card"}</div>
                          <div style={{ fontSize: "10px", color: "#555", marginTop: "1px" }}>{acc.bankName || ""} {acc.network || ""} {acc.accountRef ? "••" + acc.accountRef : ""}{sg ? " 🔗" : ""}</div>
                          {lim > 0 && <div style={{ height: "2px", background: "rgba(255,255,255,0.06)", borderRadius: "1px", marginTop: "5px" }}><div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? "#ff6b6b" : pct > 50 ? "#FFD93D" : "#7c6ef5", borderRadius: "1px" }} /></div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "13px", fontWeight: "700", color: due > 0 ? "#ff6b6b" : "#00d484" }}>₹{fmtINR(due)}</div>
                          <div style={{ fontSize: "9px", color: "#555" }}>outstanding</div>
                        </div>
                        <div style={{ color: "#444", fontSize: "18px", flexShrink: 0 }}>›</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {accounts.filter(a => a.type === "savings").length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "8px" }}>Savings Accounts</div>
                <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", overflow: "hidden" }}>
                  {accounts.filter(a => a.type === "savings").map((acc, i, arr) => {
                    const { availableBalance, txns } = getSavingsStats(acc);
                    return (
                      <div key={acc.id} onClick={() => setModal({ type: "accDetail", acc })} className="row-hover" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", cursor: "pointer" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(0,212,132,0.12)", border: "1px solid rgba(0,212,132,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>🏦</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.name || "Savings Account"}</div>
                          <div style={{ fontSize: "10px", color: "#555", marginTop: "1px" }}>{acc.bankName || ""} {acc.accountRef ? "••" + acc.accountRef : ""} · {txns.length} txns</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "13px", fontWeight: "700", color: availableBalance >= 0 ? "#00d484" : "#ff6b6b" }}>₹{fmtINR(availableBalance)}</div>
                          <div style={{ fontSize: "9px", color: "#555" }}>available</div>
                        </div>
                        <div style={{ color: "#444", fontSize: "18px", flexShrink: 0 }}>›</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sharedLimitGroups.length > 0 && (
              <div>
                <div style={{ fontSize: "11px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "8px" }}>🔗 Shared Limit Pools</div>
                <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", overflow: "hidden" }}>
                  {sharedLimitGroups.map((g, i, arr) => {
                    const pct = g.poolLimit > 0 ? Math.min((g.poolOutstanding / g.poolLimit) * 100, 100) : 0;
                    return (
                      <div key={g.bank} style={{ padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <div>
                            <div style={{ fontWeight: "600", fontSize: "13px" }}>{g.bank}</div>
                            <div style={{ fontSize: "10px", color: "#555" }}>{g.cards.length} cards · pool limit ₹{fmtINR(g.poolLimit)}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "13px", fontWeight: "700", color: g.poolOutstanding > 0 ? "#ff6b6b" : "#00d484" }}>₹{fmtINR(g.poolOutstanding)}</div>
                            <div style={{ fontSize: "9px", color: "#555" }}>pool outstanding</div>
                          </div>
                        </div>
                        <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "2px" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? "#ff6b6b" : pct > 50 ? "#FFD93D" : "#7c6ef5", borderRadius: "2px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "insights" && <InsightsTab expenses={expenses} setExpenses={setExpenses} fmtINR={fmtINR} fmtDate={fmtDate} openTxnDetail={openTxnDetail} />}

        {tab === "track" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: "18px" }}>Track Expenses</h2>
                <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>Paste SMS content or add a transaction manually.</div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="btn-ghost" style={{ borderColor: trackMode === "sms" ? "#00d484" : "rgba(255,255,255,0.12)", color: trackMode === "sms" ? "#00d484" : "#e2e2f0" }} onClick={() => setTrackMode("sms")}>SMS Paste</button>
                <button className="btn-ghost" style={{ borderColor: trackMode === "manual" ? "#00d484" : "rgba(255,255,255,0.12)", color: trackMode === "manual" ? "#00d484" : "#e2e2f0" }} onClick={() => setTrackMode("manual")}>Manual Entry</button>
              </div>
            </div>

            {trackMode === "sms" ? (
              <div>
                <div style={{ marginBottom: "12px", fontSize: "12px", color: "#aaa" }}>Paste one or more SMS messages below. The tracker will extract amounts, merchant names, card details, and dates.</div>
                <textarea ref={textRef} value={smsText} onChange={e => setSmsText(e.target.value)} placeholder="Paste SMS message text here..." style={{ width: "100%", minHeight: "180px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", color: "#e2e2f0", padding: "14px", fontSize: "13px", lineHeight: "1.5", resize: "vertical" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", gap: "10px", flexWrap: "wrap" }}>
                  <button className="btn-primary" onClick={handleTrack} disabled={loading} style={{ minWidth: "140px" }}>{loading ? `Tracking…` : `Track SMS`}</button>
                  <div style={{ color: "#aaa", fontSize: "12px" }}>{loadMsg || "Paste raw SMS text and press Track."}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label className="field-label">Merchant</label>
                  <input value={manualForm.merchant} onChange={e => setMF("merchant", e.target.value)} placeholder="Merchant name" className="field-input" />
                </div>
                <div>
                  <label className="field-label">Amount</label>
                  <input value={manualForm.amount} onChange={e => setMF("amount", e.target.value)} placeholder="Amount" className="field-input" type="number" />
                </div>
                <div>
                  <label className="field-label">Date</label>
                  <input value={manualForm.date} onChange={e => setMF("date", e.target.value)} type="date" className="field-input" />
                </div>
                <div>
                  <label className="field-label">Time</label>
                  <input value={manualForm.time} onChange={e => setMF("time", e.target.value)} type="time" className="field-input" />
                </div>
                <div>
                  <label className="field-label">Category</label>
                  <select value={manualForm.category} onChange={e => setMF("category", e.target.value)} className="field-input">
                    {Object.keys(CAT_COLOR).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Type</label>
                  <select value={manualForm.type} onChange={e => setMF("type", e.target.value)} className="field-input">
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="field-label">Linked Account</label>
                  <select value={manualForm.accountId} onChange={e => setMF("accountId", e.target.value)} className="field-input">
                    <option value="__none__">No linked account</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name || a.bankName || a.type} ••{a.accountRef}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="field-label">Note</label>
                  <textarea value={manualForm.note} onChange={e => setMF("note", e.target.value)} placeholder="Optional note" className="field-input" style={{ minHeight: "90px" }} />
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn-primary" onClick={handleManualAdd}>Add Transaction</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "debug" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: "18px" }}>Debug / State Backup</h2>
                  <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>Export app data, sign in to sync across devices, or paste snapshots when state is lost. If Supabase isn’t working, use the manual JSON snapshot export/restore workflow below.</div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="btn-ghost" onClick={copyBackupSnapshot}>Copy Snapshot</button>
                  <button className="btn-ghost" onClick={() => setDebugText(getBackupSnapshot())}>Load Current</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "center" }}>
                {!user ? (
                  <>
                    <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email for Firebase magic link" className="field-input" style={{ minWidth: '220px' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" onClick={signInWithMagicLink}>Send Firebase Link</button>
                      <button className="btn-ghost" onClick={signInWithFirebaseGoogle} style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Sign in with Google</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ color: '#b3f0c7', fontSize: '13px' }}>Signed in as <strong>{user.email || user.uid || user.id}</strong></div>
                    <button className="btn-ghost" onClick={signOut}>Sign Out</button>
                  </>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: user ? "#ddd" : "#555", fontSize: "13px" }}>
                  <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} disabled={!user} style={{ width: "16px", height: "16px" }} />
                  Auto sync
                </label>
                {user && (
                  <span style={{ fontSize: "12px", color: "#aaa" }}>(saves automatically after changes)</span>
                )}
              </div>

              {user && (
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="btn-primary" onClick={uploadToCloud} disabled={isSyncing}>{isSyncing ? "Syncing…" : "Upload to cloud"}</button>
                  <button className="btn-primary" onClick={downloadFromCloud} disabled={isSyncing}>{isSyncing ? "Syncing…" : "Download from cloud"}</button>
                </div>
              )}

              <div style={{ color: "#aaa", fontSize: "12px" }}>{user ? syncStatus : syncStatus || "Sign in to sync your data across devices."}</div>
            </div>

            <div style={{ marginBottom: "14px", fontSize: "12px", color: "#aaa" }}>Paste the JSON export from a previous session and press Restore.</div>
            <textarea value={debugText} onChange={e => setDebugText(e.target.value)} placeholder="Paste JSON state here..." style={{ width: "100%", minHeight: "240px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", color: "#e2e2f0", padding: "14px", fontSize: "13px", lineHeight: "1.5", resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
              <button className="btn-primary" onClick={restoreBackupSnapshot}>Restore Backup</button>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h2 style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: "18px" }}>Transactions</h2>
              <div style={{ display: "flex", gap: "6px" }}>
                <button className="btn-ghost" onClick={() => exportXLSX(getExpenseRows(expenses), "XpenseAI_transactions")}>⬇ XLSX</button>
                <button className="btn-ghost" onClick={() => exportCSV(getExpenseRows(expenses), "XpenseAI_transactions")}>⬇ CSV</button>
                {expenses.length > 0 && <button className="btn-ghost" style={{ color: "#ff6b6b88", borderColor: "rgba(255,107,107,0.2)" }} onClick={() => { setExpenses([]); toast_("All cleared."); }}>Clear All</button>}
              </div>
            </div>

            <div className="card" style={{ marginBottom: "14px", borderColor: "rgba(234,67,53,0.2)", background: "rgba(234,67,53,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "13px", marginBottom: "2px" }}>📧 Reconcile with Gmail</div>
                  <div style={{ fontSize: "11px", color: "#555" }}>Cross-check transactions against your email receipts</div>
                </div>
                <button className="btn-ghost" style={{ borderColor: "rgba(234,67,53,0.3)", color: "#ea4335", whiteSpace: "nowrap" }} onClick={() => setModal({ type: "reconcile" })}>Reconcile</button>
              </div>
            </div>

            {expenses.length === 0 ? (
              <div style={{ textAlign: "center", color: "#333", padding: "60px 0" }}>
                <div style={{ fontSize: "40px", marginBottom: "10px" }}>🗂️</div>
                <p style={{ margin: 0, fontSize: "14px" }}>No transactions tracked yet.</p>
              </div>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", overflow: "hidden" }}>
                {expenses.map((exp, i) => (
                  <div key={exp.id} className="row-hover" onClick={() => openTxnDetail(exp)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderBottom: i < expenses.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", transition: "background .12s" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${CAT_COLOR[exp.category] || "#9B9B9B"}1a`, border: `1px solid ${CAT_COLOR[exp.category] || "#9B9B9B"}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>
                      {exp.type === "credit" ? "💚" : CAT_ICON[exp.category] || "📦"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: "600", fontSize: "13px", marginBottom: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{exp.merchant}</div>
                      <div style={{ fontSize: "10px", color: "#444" }}>{exp.card || ""} {fmtDate(exp.date || exp.addedAt)}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: "700", fontSize: "13px", color: exp.type === "credit" ? "#00d484" : "#ff6b6b" }}>{exp.type === "credit" ? "+" : "-"}₹{fmtINR(exp.amount)}</div>
                      <div style={{ fontSize: "9px", color: CAT_COLOR[exp.category] || "#9B9B9B", background: `${CAT_COLOR[exp.category] || "#9B9B9B"}18`, padding: "1px 6px", borderRadius: "5px", marginTop: "2px" }}>{exp.category}</div>
                      {exp.billPayment && <div style={{ fontSize: "9px", color: "#a78bfa", background: "rgba(124,110,245,0.15)", padding: "1px 6px", borderRadius: "5px", marginTop: "2px" }}>💳 Bill Paid</div>}
                      <button title={exp.recurring ? "Mark as non-recurring" : "Mark as recurring"} onClick={e => { e.stopPropagation(); setExpenses(prev => prev.map(x => x.id === exp.id ? { ...x, recurring: !x.recurring } : x)); }} style={{ fontSize: "9px", color: exp.recurring ? "#00d484" : "#333", background: exp.recurring ? "rgba(0,212,132,0.12)" : "transparent", border: exp.recurring ? "1px solid rgba(0,212,132,0.3)" : "1px solid rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: "5px", marginTop: "2px", cursor: "pointer", display: "block" }}>{exp.recurring ? "🔁 Recurring" : "🔁"}</button>
                    </div>
                    <button className="del-btn" onClick={e => { e.stopPropagation(); setExpenses(prev => prev.filter(x => x.id !== exp.id)); toast_("Removed."); }} style={{ background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.25)", color: "#ff6b6b", borderRadius: "7px", width: "26px", height: "26px", cursor: "pointer", fontSize: "11px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modal?.type === "txnDetail" && editTxn && (() => {
        const e = modal.exp;
        const edit = editTxn;
        const markDirty = (k, v) => { setEditTxn(prev => ({ ...prev, [k]: v })); setEditDirty(true); };

        const saveEdits = () => {
          const chosen = accounts.find(a => a.id === edit.accountId);
          setExpenses(prev => prev.map(x => x.id !== e.id ? x : {
            ...x,
            merchant: edit.merchant,
            category: edit.category,
            type: edit.type,
            isExpense: edit.type !== "credit",
            amount: Number(edit.amount) || x.amount,
            note: edit.note,
            accountRef: chosen ? norm4(chosen.accountRef) : x.accountRef,
            card: chosen ? `${chosen.bankName || ""} ${chosen.type === "credit" ? "Card" : "A/c"} ••${chosen.accountRef}`.trim() : x.card,
            manualAccount: !!chosen,
          }));
          closeModal();
          toast_("Transaction updated.");
        };

        const inputStyle = { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e2f0", padding: "8px 10px", fontSize: "13px", fontFamily: "inherit" };
        const selStyle = { ...inputStyle };
        const labelStyle = { fontSize: "10px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "4px" };

        return (
          <Modal title="Transaction Detail" onClose={closeModal}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `${CAT_COLOR[edit.category] || "#9B9B9B"}1a`, border: `1px solid ${CAT_COLOR[edit.category] || "#9B9B9B"}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                {CAT_ICON[edit.category] || "📦"}
              </div>
              <div style={{ flex: 1 }}>
                <input value={edit.merchant} onChange={ev => markDirty("merchant", ev.target.value)} style={{ ...inputStyle, fontWeight: "700", fontSize: "15px", marginBottom: "4px" }} />
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "16px", color: edit.type === "credit" ? "#00d484" : "#ff6b6b", fontWeight: "700" }}>
                  {edit.type === "credit" ? "+" : "-"}₹{fmtINR(Number(edit.amount) || 0)}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={edit.category} onChange={ev => markDirty("category", ev.target.value)} style={selStyle}>
                  {Object.keys(CAT_COLOR).map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={edit.type} onChange={ev => markDirty("type", ev.target.value)} style={selStyle}>
                  <option value="debit">Debit (Money Out)</option>
                  <option value="credit">Credit (Money In)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Linked Account</label>
              <select value={edit.accountId} onChange={ev => markDirty("accountId", ev.target.value)} style={{ ...selStyle, borderColor: edit.accountId === "__none__" ? "rgba(255,100,100,0.3)" : "rgba(0,212,132,0.3)" }}>
                <option value="__none__">— Not linked to any account —</option>
                <optgroup label="Credit Cards">
                  {accounts.filter(a => a.type === "credit").map(a => (<option key={a.id} value={a.id}>{a.name} ••{a.accountRef} ({a.bankName || ""})</option>))}
                </optgroup>
                <optgroup label="Savings Accounts">
                  {accounts.filter(a => a.type === "savings").map(a => (<option key={a.id} value={a.id}>{a.name} ••{a.accountRef} ({a.bankName || ""})</option>))}
                </optgroup>
              </select>
              {edit.accountId === "__none__" && accounts.length > 0 && (<div style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}>⚠ Not linked — won't appear in any account statement or affect balances.</div>)}
              {edit.accountId !== "__none__" && (() => {
                const acc = accounts.find(a => a.id === edit.accountId);
                const autoRef = norm4(e.accountRef) || norm4(e.card);
                const wasAuto = acc && norm4(acc.accountRef) === autoRef;
                return acc && (
                  <div style={{ fontSize: "10px", color: e.manualAccount || !wasAuto ? "#a78bfa" : "#00d484", marginTop: "4px" }}>
                    {e.manualAccount || !wasAuto ? "✏ Manually assigned" : "✅ Auto-matched"} → {acc.name}
                  </div>
                );
              })()}
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Amount (₹)</label>
              <input type="number" value={edit.amount} onChange={ev => markDirty("amount", ev.target.value)} style={inputStyle} />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Note (optional)</label>
              <input value={edit.note} onChange={ev => markDirty("note", ev.target.value)} placeholder="Add a note…" style={inputStyle} />
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px", marginBottom: "14px" }}>
              {[["Date", fmtDate(e.date || e.addedAt)], ["Currency", e.currency || "INR"], ["Parsed Account", e.card || e.accountRef || "—"]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "12px" }}>
                  <span style={{ color: "#555" }}>{l}</span>
                  <span style={{ color: "#888" }}>{v}</span>
                </div>
              ))}
            </div>

            {edit.type !== "credit" && !e.billPayment && accounts.filter(a => a.type === "credit").length > 0 && (
              <div style={{ marginBottom: "14px", background: "rgba(124,110,245,0.07)", border: "1px solid rgba(124,110,245,0.18)", borderRadius: "10px", padding: "10px 14px" }}>
                <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}>💳 Credit card bill payment?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {accounts.filter(a => a.type === "credit").map(cc => (
                    <button key={cc.id} className="btn-ghost" style={{ fontSize: "11px", borderColor: "rgba(124,110,245,0.4)", color: "#a78bfa" }} onClick={() => applyBillPayment(e.id, cc.id)}>
                      Pay → {cc.name} ••{cc.accountRef}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {e.billPayment && (
              <div style={{ marginBottom: "14px", background: "rgba(0,212,132,0.08)", border: "1px solid rgba(0,212,132,0.2)", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", color: "#00d484" }}>
                ✅ CC bill payment → {accounts.find(a => a.id === e.billPaymentTo)?.name || "Credit Card"}
              </div>
            )}

            {e.rawMessage && (
              <details style={{ marginBottom: "14px" }}>
                <summary style={{ fontSize: "11px", color: "#444", cursor: "pointer", marginBottom: "6px" }}>📩 Original SMS</summary>
                <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "10px 12px", fontFamily: "'Space Mono',monospace", fontSize: "10px", lineHeight: "1.7", color: "#777", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.rawMessage}</div>
              </details>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={saveEdits} disabled={!editDirty} style={{ opacity: editDirty ? 1 : 0.45 }}>
                Save Changes
              </button>
            </div>
          </Modal>
        );
      })()}

      {modal?.type === "accDetail" && modal.acc && (
        <AccDetail
          acc={modal.acc}
          sharedLimitGroups={sharedLimitGroups}
          getCCStats={getCCStats}
          getSavingsStats={getSavingsStats}
          getAccountExpenses={getAccountExpenses}
          fmtINR={fmtINR}
          fmtDate={fmtDate}
          exportXLSX={exportXLSX}
          getExpenseRows={getExpenseRows}
          closeModal={closeModal}
          openTxnDetail={openTxnDetail}
          setModal={setModal}
          openEditAccount={openEditAccount}
        />
      )}

      {modal?.type === "addAccount" && (
        <Modal title={accForm.id ? "Edit Account" : "Add Account"} onClose={closeModal}>
          <Field label="Account Name" value={accForm.name} onChange={v => setAF("name", v)} />
          <Field label="Bank" value={accForm.bankName} onChange={v => setAF("bankName", v)} options={INDIAN_BANKS} />
          <Field label="Last 4 digits (for matching)" value={accForm.accountRef} onChange={v => setAF("accountRef", v)} hint="e.g. 3736" />
          {accForm.type === "credit" && <>
            <Field label="Card Network" value={accForm.network} onChange={v => setAF("network", v)} options={CARD_NETWORKS} />
            <Field label="Total Limit (₹)" value={accForm.totalLimit} onChange={v => setAF("totalLimit", v)} type="number" hint="Shared pool limit if applicable" />
            <Field label="Available Limit (₹)" value={accForm.availableLimit} onChange={v => setAF("availableLimit", v)} type="number" />

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", color: "#666", fontWeight: "600", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                Shared Limit Pool
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div onClick={() => setAF("sharedLimit", !accForm.sharedLimit)} style={{ width: "36px", height: "20px", borderRadius: "10px", background: accForm.sharedLimit ? "#7c6ef5" : "rgba(255,255,255,0.1)", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                  <div style={{ position: "absolute", top: "2px", left: accForm.sharedLimit ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
                <span style={{ fontSize: "12px", color: accForm.sharedLimit ? "#a78bfa" : "#555" }}>
                  {accForm.sharedLimit ? "This card shares its limit with other cards from the same bank" : "This card has its own independent limit"}
                </span>
              </div>
              {accForm.sharedLimit && accForm.bankName && (
                <div style={{ fontSize: "11px", color: "#666", background: "rgba(124,110,245,0.08)", border: "1px solid rgba(124,110,245,0.2)", borderRadius: "8px", padding: "8px 12px", lineHeight: "1.6" }}>
                  💡 All <b style={{ color: "#a78bfa" }}>{accForm.bankName}</b> cards with shared limit enabled will pool their credit limit together. Set the <b style={{ color: "#a78bfa" }}>same total limit</b> on each card — the pool limit will show on the dashboard.
                </div>
              )}
              {accForm.sharedLimit && !accForm.bankName && (
                <div style={{ fontSize: "11px", color: "#ff6b6b", padding: "6px 0" }}>⚠ Please select a bank above to enable shared limit grouping.</div>
              )}
            </div>
            <Field label="Statement Generation Date" value={accForm.statementDate} onChange={v => setAF("statementDate", v)} hint="Day of month e.g. 12" />
            <Field label="Grace Period (days)" value={accForm.gracePeriod} onChange={v => setAF("gracePeriod", v)} type="number" hint="Days after statement to pay (default 20)" />
            <Field label="Amount Due — Last Statement (₹)" value={accForm.lastAmtDue} onChange={v => setAF("lastAmtDue", v)} type="number" />
            <Field label="Amount Due — Current Statement (₹)" value={accForm.currentAmtDue} onChange={v => setAF("currentAmtDue", v)} type="number" />
            <Field label="Number of Active EMIs" value={accForm.emiCount} onChange={v => setAF("emiCount", v)} type="number" />
            <Field label="Total Outstanding (₹)" value={accForm.totalOutstanding} onChange={v => setAF("totalOutstanding", v)} type="number" />
          </>}
          {accForm.type === "savings" && (() => {
            const liveStats = accForm.id ? getSavingsStats(accForm) : null;
            return (
              <>
                <Field label="Initial Balance (₹)" value={accForm.initialBalance} onChange={v => setAF("initialBalance", v)} type="number" hint="Your balance when you started tracking" />
                {liveStats && (
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "11px", color: "#666", fontWeight: "600", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px" }}>Computed from Transactions</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {[
                        { l: "Net Outflow", v: `-₹${fmtINR(liveStats.netOutflow)}`, c: "#ff6b6b", hint: "Total money spent" },
                        { l: "Net Inflow", v: `+₹${fmtINR(liveStats.netInflow)}`, c: "#00d484", hint: "Total money received" },
                        { l: "Transactions", v: `${liveStats.txns.length} tracked`, c: "#7c6ef5", hint: "Linked transactions" },
                        { l: "Available Balance", v: `₹${fmtINR(liveStats.availableBalance)}`, c: liveStats.availableBalance >= 0 ? "#00d484" : "#ff6b6b", hint: "Initial − Outflow + Inflow" },
                      ].map(({ l, v, c, hint }) => (
                        <div key={l} style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "10px 12px" }}>
                          <div style={{ fontSize: "10px", color: "#444", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{l}</div>
                          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "12px", fontWeight: "700", color: c }}>{v}</div>
                          <div style={{ fontSize: "9px", color: "#333", marginTop: "2px" }}>{hint}</div>
                        </div>
                      ))}
                    </div>
                    {liveStats.txns.length === 0 && (
                      <div style={{ fontSize: "11px", color: "#444", marginTop: "8px", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                        No transactions linked yet. Make sure your account's last-4 digits match SMS messages.
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
            <button className="btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" onClick={saveAccount}>Save Account</button>
          </div>
        </Modal>
      )}

      {modal?.type === "statement" && (() => {
        const stmtExps = getAccountExpenses(modal.acc);
        return (
          <Modal title={`Statement — ${modal.acc.name || "Account"}`} onClose={closeModal} wide>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button className="btn-ghost" onClick={() => exportXLSX(getExpenseRows(stmtExps), `Statement_${modal.acc.name || "account"}`)}>⬇ XLSX</button>
              <button className="btn-ghost" onClick={() => exportCSV(getExpenseRows(stmtExps), `Statement_${modal.acc.name || "account"}`)}>⬇ CSV</button>
            </div>
            {stmtExps.length === 0 ? (
              <div style={{ textAlign: "center", color: "#333", padding: "30px 0" }}>No transactions linked to this account.<br /><span style={{ fontSize: "11px", color: "#444" }}>Make sure account last-4 digits match your SMS messages.</span></div>
            ) : (
              <div style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: "0", background: "rgba(0,0,0,0.3)", padding: "8px 14px", fontSize: "10px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                  <span>Date</span><span>Merchant</span><span>Type</span><span style={{ textAlign: "right" }}>Amount</span>
                </div>
                {stmtExps.map((e, i) => (
                  <div key={e.id} onClick={() => openTxnDetail(e)} className="row-hover" style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: "0", padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: "12px" }}>
                    <span style={{ color: "#555" }}>{fmtDate(e.date || e.addedAt)}</span>
                    <span style={{ fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.merchant}</span>
                    <span style={{ color: e.type === "credit" ? "#00d484" : "#ff6b6b", textTransform: "capitalize" }}>{e.type}</span>
                    <span style={{ textAlign: "right", fontFamily: "'Space Mono',monospace", color: e.type === "credit" ? "#00d484" : "#ff6b6b" }}>{e.type === "credit" ? "+" : "-"}₹{fmtINR(e.amount)}</span>
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: "0", padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", fontSize: "12px", fontWeight: "700" }}>
                  <span style={{ color: "#666" }}>Total</span><span></span><span></span>
                  <span style={{ textAlign: "right", fontFamily: "'Space Mono',monospace", color: "#ccc" }}>
                    {(() => {
                      const d = stmtExps.filter(e => e.type !== "credit").reduce((s, e) => s + e.amount, 0);
                      const c = stmtExps.filter(e => e.type === "credit").reduce((s, e) => s + e.amount, 0);
                      return `${c > 0 ? "+₹" + fmtINR(c) + " " : ""}-₹${fmtINR(d)}`;
                    })()}
                  </span>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {modal?.type === "reconcile" && (
        <Modal title="Reconcile with Gmail" onClose={closeModal}>
          <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>📧</div>
            <p style={{ color: "#666", fontSize: "13px", lineHeight: "1.6", margin: "0 0 20px" }}>
              Connect your Gmail account to cross-check tracked transactions against email receipts from Amazon, Swiggy, and other merchants.
            </p>
            <div style={{ background: "rgba(234,67,53,0.08)", border: "1px solid rgba(234,67,53,0.2)", borderRadius: "12px", padding: "14px", marginBottom: "20px", textAlign: "left" }}>
              <div style={{ fontSize: "12px", color: "#888", lineHeight: "1.7" }}>
                <b style={{ color: "#ea4335" }}>How it works:</b><br />
                1. Click Connect Gmail below<br />
                2. Claude searches your inbox for payment/order receipts<br />
                3. Transactions are matched by amount, date & merchant<br />
                4. Unmatched items are flagged for review
              </div>
            </div>
            <button className="btn-primary" style={{ background: "linear-gradient(135deg,#ea4335,#fbbc04)", width: "100%" }} onClick={() => { closeModal(); setTab("history"); toast_("Gmail reconciliation requires the Gmail connector. Enable it in settings.", "error"); }}>
              Connect Gmail Account
            </button>
            <p style={{ fontSize: "10px", color: "#333", marginTop: "10px" }}>Gmail access is read-only. No emails are stored.</p>
          </div>
        </Modal>
      )}
      <div style={{ background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.07)", position: "sticky", bottom: 0, zIndex: 100, backdropFilter: "blur(12px)", padding: "8px 0", marginTop: "16px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px", alignItems: "center", padding: "0 8px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", minWidth: 0, justifyContent: "center", width: "100%" }}>
            {TABS.map(t => {
              const [icon, ...nameParts] = t.label.split(" ");
              const name = nameParts.join(" ");
              return (
                <button
                  key={t.id}
                  className="tab-pill bottom-tab icon-only"
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: tab === t.id ? "#7c6ef5" : "#555",
                    fontWeight: tab === t.id ? "700" : "500",
                    fontSize: "16px",
                    padding: "10px 12px",
                    cursor: "pointer",
                    borderBottom: tab === t.id ? "2px solid #7c6ef5" : "2px solid transparent",
                    whiteSpace: "nowrap",
                    transition: "color .15s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "42px"
                  }}>
                  <span className="nav-icon">{icon}</span>
                  <span className="nav-label">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null, React.createElement(App))
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
