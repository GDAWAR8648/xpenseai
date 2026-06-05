const XLSX = window.XLSX;

// ─── Helpers and persistence ─────────────────────────────────────────────────
const SK_EXP = "xpenseai_expenses_v1";
const SK_ACC = "xpenseai_accounts_v1";

const norm4 = (s) => (s || "").replace(/X/gi, "").replace(/\D/g, "").slice(-4);

const lsGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const lsSet = (key, val) => { try { localStorage.setItem(key, val); return true; } catch { return false; } };

const loadExpenses = () => {
  try {
    const raw = lsGet(SK_EXP);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map(e => ({ ...e, accountRef: norm4(e.accountRef) || norm4(e.card) || "" }));
  } catch { return []; }
};

const loadAccounts = () => {
  try {
    const raw = lsGet(SK_ACC);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveExpenses = (expenses) => lsSet(SK_EXP, JSON.stringify(expenses));
const saveAccounts = (accounts) => lsSet(SK_ACC, JSON.stringify(accounts));

const CAT_COLOR = {
  Food: "#FF6B6B",
  Shopping: "#FFD93D",
  Travel: "#6BCB77",
  Entertainment: "#4D96FF",
  Bills: "#C77DFF",
  Health: "#FF9F1C",
  Transfer: "#2EC4B6",
  Other: "#9B9B9B"
};

const CAT_ICON = {
  Food: "🍽️",
  Shopping: "🛍️",
  Travel: "✈️",
  Entertainment: "🎬",
  Bills: "📄",
  Health: "💊",
  Transfer: "💸",
  Other: "📦"
};

const CARD_NETWORKS = ["Visa", "Mastercard", "American Express", "RuPay"];

const INDIAN_BANKS = [
  "Axis Bank","HDFC Bank","ICICI Bank","SBI (State Bank of India)",
  "Kotak Mahindra Bank","Yes Bank","IndusInd Bank","IDFC FIRST Bank",
  "Bank of Baroda","Punjab National Bank","Canara Bank","Union Bank of India",
  "Federal Bank","RBL Bank","South Indian Bank","Karnataka Bank",
  "Bandhan Bank","AU Small Finance Bank","Standard Chartered","Citibank",
  "American Express","HSBC","Deutsche Bank","DBS Bank","Other"
];

const fmtINR = (n) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; } };

const splitSMS = (text) => {
  const START = /(?:^|\n)(?=(?:Spent INR|Debit INR|Payment of INR|Credited INR|INR [\d,.]+ (?:debited|credited)))/gi;
  const parts = text.split(START).map(s => s.trim()).filter(s => s.length > 10);
  return parts.length > 1 ? parts : [text.trim()];
};

const regexParse = (msg) => {
  const debitMatch = msg.match(/(?:Spent\s+INR|INR|Debit\s+INR)\s*([\d,]+\.?\d*)/i);
  const creditMatch = msg.match(/(?:Credited\s+INR|INR\s+credited)\s*([\d,]+\.?\d*)/i);
  const amount = debitMatch ? parseFloat(debitMatch[1].replace(/,/g, ""))
    : creditMatch ? parseFloat(creditMatch[1].replace(/,/g, "")) : null;
  if (!amount) return null;
  const type = creditMatch ? "credit" : "debit";

  const upiMatch = msg.match(/UPI\/\w+\/\d+\/([^\n]+)/i);
  const cardMerchant = msg.match(/\d{2}:\d{2}:\d{2}(?:\s+IST)?\n([^\n]+)/i);
  const merchant = upiMatch?.[1]?.trim() || cardMerchant?.[1]?.trim() || "Unknown";

  const cardMatch = msg.match(/Card\s+no\.?\s*(XX\d+)/i);
  const acMatch = msg.match(/A\/c\s+(?:no\.?\s*)?(XX\d+)/i);
  const achMatch = msg.match(/Axis Bank A\/c\s+(XX\d+)/i);
  const card = cardMatch ? `Axis Bank Card ${cardMatch[1]}`
    : acMatch ? `Axis Bank A/c ${acMatch[1]}`
    : achMatch ? `Axis Bank A/c ${achMatch[1]}` : null;

  const acNum = norm4(cardMatch?.[1] || acMatch?.[1] || achMatch?.[1] || "");

  const dateRaw = msg.match(/(\d{2}-\d{2}-\d{2,4})[,\s]+(\d{2}:\d{2}:\d{2})/);
  let date = null;
  if (dateRaw) {
    try {
      const p = dateRaw[1].split("-");
      const y = p[2].length === 2 ? "20" + p[2] : p[2];
      date = new Date(`${y}-${p[1]}-${p[0]}T${dateRaw[2]}`).toISOString();
    } catch {}
  }

  const lower = msg.toLowerCase();
  let category = "Other";
  if (/amazon|flipkart|myntra|blink|shop|mall|zara|nike|gyftr|snapmint|boutique/.test(lower)) category = "Shopping";
  else if (/swiggy|zomato|food|restaurant|cafe|pizza|kirana|garg/.test(lower)) category = "Food";
  else if (/uber|ola|flight|air|train|irctc|travel|hotel/.test(lower)) category = "Travel";
  else if (/netflix|prime|spotify|movie|game|cred/.test(lower)) category = "Entertainment";
  else if (/electricity|gas|water|broadband|bill|recharge|pnb|housing|ach/.test(lower)) category = "Bills";
  else if (/apollo|pharma|medical|hospital|health/.test(lower)) category = "Health";
  else if (/transfer|neft|imps|upi\/p2a|hdfc|bank limited/.test(lower)) category = "Transfer";

  return {
    amount,
    currency: "INR",
    merchant,
    card,
    accountRef: acNum,
    date,
    category,
    type,
    isExpense: type === "debit"
  };
};

const parseViaAI = async (messages) => {
  const numbered = messages.map((m, i) => `--- MSG ${i+1} ---\n${m}`).join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `Parse each bank SMS. Return ONLY a JSON array, one object per message, same order.\nEach: {"amount":number,"currency":"INR","merchant":"string","card":"string|null","accountRef":"4-digit number only e.g. 4750 or 3736, extracted from Card no. XX4750 or A/c XX3736 — digits only, no XX","date":"ISO|null","category":"Food|Shopping|Travel|Entertainment|Bills|Health|Transfer|Other","type":"debit|credit","isExpense":true|false}\n- UPI merchant = last segment after final / in UPI ref\n- Card txn merchant = line after timestamp\n- type=credit if money came IN, debit if money went OUT\n- isExpense=false for credit card bill reminders\nMessages:\n${numbered}`
      }]
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  const text = data.content?.find(b => b.type === "text")?.text || "";
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
};

const exportXLSX = (rows, filename) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, filename + ".xlsx");
};

const exportCSV = (rows, filename) => {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = filename + ".csv";
  a.click();
};

const getExpenseRows = (list) => list.map(e => ({
  Date: fmtDate(e.date || e.addedAt),
  Merchant: e.merchant,
  Amount: e.amount,
  Currency: e.currency || "INR",
  Type: e.type || "debit",
  Category: e.category,
  Card: e.card || "",
  AccountRef: e.accountRef || ""
}));
