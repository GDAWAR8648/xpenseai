const { useState } = React;

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
    <div style={{ background: "#161625", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "18px", width: "100%", maxWidth: wide ? "720px" : "520px", maxHeight: "88vh", overflowY: "auto", padding: "24px" }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>{title}</h2>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#aaa", borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", fontSize: "16px" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

function InsightsTab({ expenses, setExpenses, fmtINR, fmtDate, openTxnDetail }) {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [selMonth, setSelMonth] = useState(defaultMonth);

  const availMonths = [...new Set(expenses.map(e => {
    const d = new Date(e.date || e.addedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }))].sort((a, b) => b.localeCompare(a));

  const monthTxns = expenses.filter(e => {
    const d = new Date(e.date || e.addedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === selMonth;
  });
  const debits = monthTxns.filter(e => e.type !== "credit");
  const credits = monthTxns.filter(e => e.type === "credit");
  const totalDebits = debits.reduce((s, e) => s + (e.amount || 0), 0);
  const totalCredits = credits.reduce((s, e) => s + (e.amount || 0), 0);

  const byCat = {};
  debits.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0); });
  const top5cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = top5cats[0]?.[1] || 1;
  const top5txns = [...debits].sort((a, b) => b.amount - a.amount).slice(0, 5);

  const recurring = expenses.filter(e => e.recurring && e.type !== "credit");
  const recurringTotal = recurring.reduce((s, e) => s + (e.amount || 0), 0);

  const [yr, mo] = selMonth.split("-");
  const monthLabel = new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const toggleRecurring = (id) => setExpenses(prev => prev.map(x => x.id === id ? { ...x, recurring: !x.recurring } : x));

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: "18px" }}>Insights</h2>
        <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e2f0", padding: "6px 10px", fontSize: "12px", fontFamily: "inherit" }}>
          {availMonths.length > 0 ? availMonths.map(m => {
            const [y2, m2] = m.split("-");
            return <option key={m} value={m}>{new Date(Number(y2), Number(m2) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</option>;
          }) : <option value={selMonth}>{monthLabel}</option>}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        {[
          { l: "Spent", v: `₹${fmtINR(totalDebits)}`, c: "#ff6b6b" },
          { l: "Received", v: `₹${fmtINR(totalCredits)}`, c: "#00d484" },
          { l: "Transactions", v: `${monthTxns.length}`, c: "#7c6ef5" },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${c}22`, borderRadius: "12px", padding: "12px 10px" }}>
            <div style={{ fontSize: "10px", color: "#555", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>{l}</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "13px", fontWeight: "700", color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "14px" }}>Top Categories</div>
        {top5cats.length > 0 ? top5cats.map(([cat, amt]) => (
          <div key={cat} style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span>{CAT_ICON[cat]} {cat}</span>
              <span style={{ fontFamily: "'Space Mono',monospace", color: CAT_COLOR[cat], fontSize: "11px" }}>
                ₹{fmtINR(amt)} <span style={{ color: "#444" }}>({totalDebits > 0 ? ((amt / totalDebits) * 100).toFixed(0) : 0}%)</span>
              </span>
            </div>
            <div style={{ height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(amt / maxCat) * 100}%`, background: CAT_COLOR[cat] || "#7c6ef5", borderRadius: "4px", transition: "width .6s ease" }} />
            </div>
            <div style={{ fontSize: "9px", color: "#444", marginTop: "2px" }}>
              {debits.filter(e => e.category === cat).length} transactions
            </div>
          </div>
        )) : (
          <div style={{ textAlign: "center", color: "#333", padding: "16px 0", fontSize: "12px" }}>No spending data for {monthLabel}.</div>
        )}
      </div>

      {top5txns.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "16px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "12px" }}>Top 5 Transactions</div>
          {top5txns.map((e, i) => (
            <div key={e.id} onClick={() => openTxnDetail(e)} className="row-hover" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: i < top5txns.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", cursor: "pointer" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", color: "#555", flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.merchant}</div>
                <div style={{ fontSize: "10px", color: "#555" }}>{fmtDate(e.date || e.addedAt)} · {e.category}</div>
              </div>
              <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "13px", fontWeight: "700", color: "#ff6b6b", flexShrink: 0 }}>₹{fmtINR(e.amount)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,132,0.2)", borderRadius: "14px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "#00d484", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px" }}>🔁 Recurring</div>
          {recurringTotal > 0 && <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "12px", color: "#ff6b6b", fontWeight: "700" }}>₹{fmtINR(recurringTotal)}/mo</div>}
        </div>
        {recurring.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#444", textAlign: "center", padding: "10px 0", lineHeight: "1.6" }}>
            No recurring transactions yet.<br />
            <span style={{ fontSize: "11px", color: "#333" }}>Tap 🔁 next to any transaction in History to mark it.</span>
          </div>
        ) : (
          <>
            {recurring.map((e, i) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: i < recurring.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => openTxnDetail(e)}>
                  <div style={{ fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.merchant}</div>
                  <div style={{ fontSize: "10px", color: "#555" }}>{e.category} · {e.card || ""}</div>
                </div>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "12px", color: "#ff6b6b", fontWeight: "700", flexShrink: 0 }}>₹{fmtINR(e.amount)}</div>
                <button onClick={() => toggleRecurring(e.id)} title="Remove recurring" style={{ background: "rgba(0,212,132,0.1)", border: "1px solid rgba(0,212,132,0.3)", color: "#00d484", borderRadius: "6px", padding: "2px 6px", fontSize: "10px", cursor: "pointer", flexShrink: 0 }}>
                  🔁
                </button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#555" }}>Estimated monthly recurring</span>
              <span style={{ fontFamily: "'Space Mono',monospace", color: "#ff6b6b", fontWeight: "700" }}>₹{fmtINR(recurringTotal)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AccDetail({ acc, sharedLimitGroups, getCCStats, getSavingsStats, getAccountExpenses, fmtINR, fmtDate, exportXLSX, getExpenseRows, closeModal, openTxnDetail, setModal, openEditAccount }) {
  const isCC = acc.type === "credit";
  const sharedGroup = isCC && acc.sharedLimit && acc.bankName
    ? sharedLimitGroups.find(g => g.bank === acc.bankName) : null;

  let displayOutstanding = 0, displayAvailable = 0, displayLimit = 0, utilPct = 0;
  let ccStats = null, savStats = null;
  if (isCC) {
    ccStats = getCCStats(acc);
    displayOutstanding = sharedGroup ? sharedGroup.poolOutstanding : ccStats.outstanding;
    displayAvailable = sharedGroup ? sharedGroup.poolAvailable : ccStats.computedAvailable;
    displayLimit = sharedGroup ? sharedGroup.poolLimit : ccStats.totalLimit;
    utilPct = displayLimit > 0 ? (displayOutstanding / displayLimit) * 100 : 0;
  } else {
    savStats = getSavingsStats(acc);
  }

  const accExp = getAccountExpenses(acc);
  const upcomingEMI = !isCC
    ? savStats.txns.filter(e => /ach|emi|loan|housing|hdfc bank limited/i.test(e.merchant || ""))
    : [];

  const fields = isCC ? [
    { l: sharedGroup ? "Pool Limit" : "Total Limit", v: `₹${fmtINR(displayLimit)}`, c: "#aaa" },
    { l: sharedGroup ? "Pool Available" : "Available", v: `₹${fmtINR(displayAvailable)}`, c: "#00d484" },
    { l: "This Card Spend", v: `-₹${fmtINR(ccStats.txnSpend)}`, c: "#ff6b6b" },
    { l: "Payments / Refunds", v: `+₹${fmtINR(ccStats.txnPayments)}`, c: "#00d484" },
    { l: "Current Period Due", v: `₹${fmtINR(ccStats.currentStmtDue || 0)}`, c: "#ff6b6b" },
    { l: "Last Statement Due", v: `₹${fmtINR(ccStats.lastAmtDue || 0)}`, c: "#FFD93D" },
    { l: "Active EMIs", v: acc.emiCount || "0", c: "#aaa" },
  ] : [
    { l: "Initial Balance", v: `₹${fmtINR(savStats.initialBalance)}`, c: "#aaa" },
    { l: "Transactions", v: `${savStats.txns.length} tracked`, c: "#7c6ef5" },
    { l: "Net Outflow", v: `-₹${fmtINR(savStats.netOutflow)}`, c: "#ff6b6b" },
    { l: "Net Inflow", v: `+₹${fmtINR(savStats.netInflow)}`, c: "#00d484" },
  ];

  return (
    <Modal title={acc.name || (isCC ? "Credit Card" : "Savings Account")} onClose={closeModal} wide>
      <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        <button className="btn-ghost" style={{ fontSize: "11px" }} onClick={() => { closeModal(); setModal({ type: "statement", acc }); }}>📄 Statement</button>
        <button className="btn-ghost" style={{ fontSize: "11px" }} onClick={() => { closeModal(); openEditAccount(acc); }}>✏ Edit</button>
        {isCC && <button className="btn-ghost" style={{ fontSize: "11px" }} onClick={() => exportXLSX(getExpenseRows(accExp), `Statement_${acc.name || "card"}`)}>⬇ XLSX</button>}
      </div>
      <div style={{ fontSize: "12px", color: "#555", marginBottom: "12px" }}>
        {acc.bankName || ""} {isCC ? acc.network || "" : ""} {acc.accountRef ? "••" + acc.accountRef : ""}
        {acc.sharedLimit && <span style={{ color: "#7c6ef5", marginLeft: "8px" }}>🔗 Shared pool</span>}
      </div>
      {isCC ? (
        <div style={{ background: "rgba(255,107,107,0.07)", border: "1px solid rgba(255,107,107,0.15)", borderRadius: "12px", padding: "14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>{sharedGroup ? "Pool Outstanding" : "Total Outstanding"}</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "22px", fontWeight: "700", color: displayOutstanding > 0 ? "#ff6b6b" : "#00d484" }}>₹{fmtINR(displayOutstanding)}</div>
            <div style={{ fontSize: "10px", color: "#444", marginTop: "3px" }}>Limit ₹{fmtINR(displayLimit)} · Available ₹{fmtINR(displayAvailable)}</div>
          </div>
          <div style={{ fontSize: "28px", opacity: 0.4 }}>💳</div>
        </div>
      ) : (
        <div style={{ background: "rgba(0,212,132,0.07)", border: "1px solid rgba(0,212,132,0.15)", borderRadius: "12px", padding: "14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Available Balance</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "22px", fontWeight: "700", color: savStats.availableBalance >= 0 ? "#00d484" : "#ff6b6b" }}>₹{fmtINR(savStats.availableBalance)}</div>
            <div style={{ fontSize: "10px", color: "#444", marginTop: "3px" }}>Initial ₹{fmtINR(savStats.initialBalance)} · {savStats.txns.length} txns</div>
          </div>
          <div style={{ fontSize: "28px", opacity: 0.4 }}>🏦</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
        {fields.map(({ l, v, c }) => (
          <div key={l} style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "8px 10px" }}>
            <div style={{ fontSize: "9px", color: "#444", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{l}</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "11px", fontWeight: "700", color: c }}>{v}</div>
          </div>
        ))}
      </div>
      {isCC && displayLimit > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#444", marginBottom: "4px" }}>
            <span>Utilization</span>
            <span style={{ color: utilPct > 80 ? "#ff6b6b" : utilPct > 50 ? "#FFD93D" : "#00d484" }}>{utilPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: "5px", background: "rgba(255,255,255,0.06)", borderRadius: "3px" }}>
            <div style={{ height: "100%", width: `${Math.min(utilPct, 100)}%`, background: utilPct > 80 ? "#ff6b6b" : utilPct > 50 ? "#FFD93D" : "#7c6ef5", borderRadius: "3px" }} />
          </div>
        </div>
      )}
      {isCC && (acc.statementDate || ccStats.nextDueDate) && (
        <div style={{ marginBottom: "12px", background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: "10px", padding: "10px 12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "12px" }}>
            {acc.statementDate && <span style={{ color: "#888" }}>📅 Generates: {acc.statementDate}th of month</span>}
            {ccStats.lastDueDate && <span style={{ color: "#ff6b6b", fontWeight: "600" }}>⏰ Last stmt due: {ccStats.lastDueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</span>}
            {ccStats.nextDueDate && <span style={{ color: "#888" }}>Next due: {ccStats.nextDueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</span>}
          </div>
          {ccStats.lastStmtStart && ccStats.lastStmtEnd && (
            <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>
              Last stmt: {ccStats.lastStmtStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – {ccStats.lastStmtEnd.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              {' · '}{ccStats.lastPeriodTxns?.length || 0} transactions · ₹{(ccStats.lastAmtDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} due
            </div>
          )}
          {ccStats.currentStmtStart && ccStats.currentStmtEnd && (
            <div style={{ fontSize: "10px", color: "#444", marginTop: "3px" }}>
              Accruing: {ccStats.currentStmtStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – {ccStats.currentStmtEnd.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              {' · '}{ccStats.currentPeriodTxns?.length || 0} txns · ₹{(ccStats.currentStmtDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} accruing
            </div>
          )}
        </div>
      )}
      {!isCC && upcomingEMI.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "10px", color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Recurring / EMI</div>
          {upcomingEMI.slice(0, 5).map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ color: "#888" }}>{e.merchant}</span>
              <span style={{ fontFamily: "'Space Mono',monospace", color: "#ff6b6b" }}>-₹{fmtINR(e.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {accExp.length > 0 ? (
        <div>
          <div style={{ fontSize: "10px", color: "#555", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Recent Transactions ({accExp.length})</div>
          {accExp.slice(0, 5).map(e => (
            <div key={e.id} onClick={() => { closeModal(); openTxnDetail(e); }} className="row-hover" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}>
              <span style={{ color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>{e.merchant}</span>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Space Mono',monospace", color: e.type === "credit" ? "#00d484" : "#ff6b6b" }}> {e.type === "credit" ? "+" : "-"}₹{fmtINR(e.amount)}</div>
                <div style={{ fontSize: "9px", color: "#444" }}>{fmtDate(e.date || e.addedAt)}</div>
              </div>
            </div>
          ))}
          {accExp.length > 5 && (
            <button className="btn-ghost" style={{ width: "100%", marginTop: "8px", fontSize: "11px" }} onClick={() => { closeModal(); setModal({ type: "statement", acc }); }}>
              View all {accExp.length} →
            </button>
          )}
        </div>
      ) : (
        <div style={{ textAlign: "center", color: "#444", padding: "16px 0", fontSize: "12px" }}>No linked transactions yet.</div>
      )}
    </Modal>
  );
}

const Field = ({ label, value, onChange, type = "text", options, hint }) => (
  <div style={{ marginBottom: "14px" }}>
    <label style={{ fontSize: "11px", color: "#666", fontWeight: "600", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "5px" }}>{label}{hint && <span style={{ color: "#444", fontWeight: "400", marginLeft: "6px", textTransform: "none" }}>{hint}</span>}</label>
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e8e8f0", padding: "9px 12px", fontSize: "13px" }}>
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e8e8f0", padding: "9px 12px", fontSize: "13px" }} />
    )}
  </div>
);
