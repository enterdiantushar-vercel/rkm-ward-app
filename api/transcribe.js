// Vercel serverless function: turns a doctor's recorded audio into text using Deepgram (medical model).
// Needs environment variable DEEPGRAM_API_KEY in Vercel. Never put the key in .html files.
// To add hospital words, add them to TERMS below (keep the list under about 100 words).
const SUPABASE_URL = "https://cqjqewlzxebszpnqhmev.supabase.co";
const SUPABASE_KEY = "sb_publishable_rTd12RguCfNQYezz4febZA_xuIJW3OM";

const TERMS_NICU = [
  "PEEP","FiO2","SpO2","CPAP","HFNC","NIV","ventilator","surfactant","caffeine","CRT","EBM","TPN","OGT","NG feeds",
  "phototherapy","bilirubin","CRP","WBC","platelets","hemogram","hemoglobin","creatinine","sodium","potassium","calcium",
  "dextrose","GIR","urine output","ml/kg/day","antibiotics","ampicillin","gentamicin","amikacin","cefotaxime","meropenem",
  "vancomycin","piperacillin","tazobactam","fluconazole","acyclovir","prematurity","respiratory distress syndrome",
  "bronchopulmonary dysplasia","necrotizing enterocolitis","sepsis","apnea","jaundice","hypoglycemia",
  "patent ductus arteriosus","intraventricular hemorrhage","retinopathy of prematurity","kangaroo mother care",
  "birth asphyxia","hypoxic ischemic encephalopathy","anterior fontanelle","head ultrasound","chest X-ray","blood gas",
  "respiratory acidosis","metabolic acidosis","lactate","blood culture","CSF","OFC","femoral pulses","aspirate","vomiting",
  "stool","weight gain","gestational age","central line","UVC","PICC","nasal prongs","room air","oxygen saturation",
  "heart rate","respiratory rate","blood pressure","capillary refill time"
];


const TERMS_ADULT = [
  "afebrile","febrile","GRBS","ECG","troponin","creatinine","urea","hemoglobin","TLC","platelets","CRP","LFT","RFT","sodium","potassium",
  "GCS","pallor","icterus","edema","tachycardia","bradycardia","crepitations","rhonchi","wheeze","bowel sounds",
  "hepatomegaly","splenomegaly","ascites","Foley catheter","RT feed","central line","ventilator","BiPAP","CPAP",
  "noradrenaline","dopamine","dobutamine","midazolam","fentanyl","pantoprazole","ceftriaxone","piperacillin","tazobactam",
  "meropenem","metronidazole","paracetamol","ondansetron","insulin","heparin","enoxaparin","aspirin","clopidogrel",
  "atorvastatin","furosemide","normal saline","Ringer lactate","dextrose","NPO","SOS","stat","BD","TDS","SpO2","room air",
  "blood pressure","pulse","respiratory rate","temperature","chest X-ray","CT scan","ultrasound","post operative day",
  "dressing","drain","suture removal","discharge","antibiotics","day three","day five"
];

async function deepgram(buf, mime, model, terms) {
  const qs = ["model=" + model, "language=en", "smart_format=true", "punctuate=true"].concat(terms.map(t => "keyterm=" + encodeURIComponent(t))).join("&");
  return fetch("https://api.deepgram.com/v1/listen?" + qs, {
    method: "POST",
    headers: { Authorization: "Token " + process.env.DEEPGRAM_API_KEY, "Content-Type": mime || "audio/webm" },
    body: buf
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Not logged in" });
    const u = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token } });
    if (!u.ok) return res.status(401).json({ error: "Login expired. Please log in again." });
    if (!process.env.DEEPGRAM_API_KEY) return res.status(500).json({ error: "DEEPGRAM_API_KEY is not set in Vercel." });

    const b64 = String((req.body && req.body.audio) || "");
    if (!b64 || b64.length > 4000000) return res.status(400).json({ error: "Audio missing or too long (max about 2 minutes)." });
    const buf = Buffer.from(b64, "base64");
    const mime = String((req.body && req.body.mime) || "audio/webm").split(";")[0];
    const chart = req.body && req.body.chart === "adult" ? "adult" : "nicu";
    const terms = chart === "adult" ? TERMS_ADULT : TERMS_NICU;

    const tA = Date.now();
    let r = await deepgram(buf, mime, process.env.DEEPGRAM_MODEL || "nova-3-medical", terms);
    if (!r.ok && r.status === 400) r = await deepgram(buf, mime, "nova-3", terms); // fallback if the medical model/options are rejected
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.err_msg || j.message || "Speech service error") });
    const alt = j.results && j.results.channels && j.results.channels[0] && j.results.channels[0].alternatives && j.results.channels[0].alternatives[0];
    const text = (alt && alt.transcript) || "";
    const tB = Date.now();
    const out = { text };
    if (req.body.sort && text.trim()) { // one-step: sort in the same request (saves a round trip)
      try {
        const field = String(req.body.field || "");
        const prior = field ? "" : String(req.body.prior || "").slice(0, 6000);
        out.fields = await require("./sort.js").sortText((prior ? prior + " " : "") + text, chart, field);
      } catch (e) { out.sortError = e.message; }
    }
    out.ms = { stt: ((tB - tA) / 1000).toFixed(1), sort: ((Date.now() - tB) / 1000).toFixed(1) };
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: "Could not transcribe: " + e.message });
  }
};
