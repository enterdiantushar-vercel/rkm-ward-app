// Vercel serverless function: sorts a doctor's free text into NICU chart fields.
// Needs environment variable ANTHROPIC_API_KEY in Vercel (never put the key in .html files).
const SUPABASE_URL = "https://cqjqewlzxebszpnqhmev.supabase.co";
const SUPABASE_KEY = "sb_publishable_rTd12RguCfNQYezz4febZA_xuIJW3OM";

const FIELDS = {
  background: "Background / admission problem or diagnosis",
  current_problems: "Current problems",
  progress: "Progress in last 24 hours",
  respiration: "Respiration, respiratory support, blood gas, chest X-ray",
  cvs: "Cardiovascular: HR, CRT, BP, femoral pulses, auscultation",
  abdomen: "Abdomen examination",
  fluid_total: "Total fluid (ml/kg/day)",
  iv_pn: "IV fluid / parenteral nutrition, type, urine output (ml/kg/day)",
  enteral: "Enteral feeds (NG/oral), type, amount (ml/kg/day), aspirate, vomiting",
  wt_stool: "Weight gain and stool",
  hematology: "Hematology and jaundice (bilirubin, phototherapy)",
  cns: "CNS: anterior fontanelle, OFC, head ultrasound with date",
  sepsis: "Sepsis: date of diagnosis, antibiotics with day number",
  cultures: "Blood culture, CSF, other cultures",
  investigations: "Investigations: hemogram, biochemistry",
  communication: "Communication with parents / family",
  impression: "Impression",
  plan: "Plan",
  other: "Anything stated that fits no other field",
  current_weight: "Current weight of the baby with unit"
};

const SYSTEM = `You sort a doctor's dictated or typed neonatal/pediatric ward note into fields.
Rules:
- Use ONLY information the doctor actually stated. Never invent, infer, calculate or add any value, diagnosis, dose or advice.
- The text comes from speech recognition (Indian-accented English) in a neonatal/pediatric ward, so correct obvious mishearings using NICU knowledge. Examples: "free maturity"/"pre maturity" = prematurity; "pwp", "peep" = PEEP; "fio2", "fio225%" = FiO2 (so "fio225%" = FiO2 25%); "spy to", "spo2", "s p o 2" = SpO2; "BP 62 by 38" = BP 62/38; "ml part kg birthday", "ml per kg birthday", "ml per kg per day" = ml/kg/day; "with you in output" = urine output; "ebm" = EBM; "tpn" = TPN; "cxr" = CXR; "CRT less than 2 seconds" = CRT <2 sec.
- Keep every number and unit exactly as spoken. Never guess a number.
- More mishearings: "a5", "pwp 5", "p 5" near FiO2 or SpO2 usually = PEEP 5; "spot 95", "spy to 95" = SpO2 95%; "discount", "dextrous" = dextrose; "antivirus" in a plan = antibiotics [? antibiotics]; "tennis to" or "plan to" before treatment advice = Plan; "crpc", "c r p" = CRP; "kg birthday", "particle birthday" after ml = ml/kg/day; "with you do not put" = urine output.
- Doctors may say full words: "oxygen saturation" = SpO2, "heart rate" = HR, "respiratory rate" = RR, "capillary refill time" = CRT, "blood pressure" = BP, "positive end expiratory pressure" = PEEP. Use the standard abbreviation.
- Placement hints: RR, SpO2, PEEP, PIP, FiO2, ventilator, CPAP, HFNC, room air, blood gas, chest X-ray go to respiration. HR, CRT, BP, pulses, heart sounds go to cvs. WBC, platelets, Hb, CRP, sodium, potassium, creatinine go to investigations. Bilirubin, jaundice, phototherapy go to hematology. Orders such as continue, stop or start a drug go to plan.
- When you can suggest a likely meaning but are not sure, write the heard words followed by [? possibly ...], for example "A5 [? possibly PEEP 5]". A bare group of numbers with no label that you cannot place goes into "other" with [?].
- If a phrase is unclear and you cannot confidently correct it, keep the original words and add " [?]" right after it so the doctor can check it.
- If a field is not mentioned, return an empty string for it.
- If something stated fits no field, put it in "other".
- Reply with ONE JSON object only, no markdown, no commentary. Include ONLY the keys that have content and leave out empty ones. Keys and their meaning:
${Object.entries(FIELDS).map(([k, v]) => `"${k}": ${v}`).join("\n")}`;

async function sortText(text) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 2000, system: SYSTEM, messages: [{ role: "user", content: text }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "AI service error");
  const out = (j.content || []).map(b => b.text || "").join("");
  const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  const fields = {};
  Object.keys(FIELDS).forEach(k => { if (typeof parsed[k] === "string" && parsed[k].trim()) fields[k] = parsed[k].trim(); });
  return fields;
}

const handler = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Not logged in" });
    const u = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token } });
    if (!u.ok) return res.status(401).json({ error: "Login expired. Please log in again." });

    const text = String((req.body && req.body.text) || "").slice(0, 8000);
    if (!text.trim()) return res.status(400).json({ error: "No text received" });
    return res.status(200).json({ fields: await sortText(text) });
  } catch (e) {
    return res.status(500).json({ error: "Could not process: " + e.message });
  }
};

module.exports = handler;
module.exports.sortText = sortText; // also used by api/transcribe.js (one-step transcribe + sort)
