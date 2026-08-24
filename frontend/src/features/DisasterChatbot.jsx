import React, { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Minimize2, Maximize2, Phone, AlertCircle, ChevronRight, RefreshCw } from "lucide-react";

const QUICK_REPLIES = [
  "What to do during earthquake?",
  "Nearest shelter in Guwahati",
  "Flood safety tips",
  "Emergency kit checklist",
  "How to report a disaster?",
  "Cyclone safety guide",
];

const KNOWLEDGE_BASE = [
  {
    keywords: ["earthquake", "quake", "tremor", "seismic", "shake"],
    title: "Earthquake Safety",
    response: "During an Earthquake:\n\nIMMEDIATELY:\n• DROP to the ground\n• Take COVER under sturdy furniture or against interior wall\n• HOLD ON until shaking stops\n• Stay away from windows and exterior walls\n\nAFTERWARDS:\n• Check yourself for injuries before helping others\n• Turn off gas if you smell gas\n• Expect aftershocks\n• Do not use elevators\n• Move to open ground if indoors\n\nASSAM HELPLINE: 1070 | NDRF: 011-24363260",
  },
  {
    keywords: ["flood", "flooding", "inundation", "water level", "brahmaputra", "rise"],
    title: "Flood Safety",
    response: "During a Flood:\n\nIMMEDIATELY:\n• Move to higher ground right away\n• Do NOT walk in moving water (15cm can knock you down)\n• Avoid flood waters - may contain sewage\n• Turn off utilities at main switches if safe\n• Disconnect electrical appliances\n\nEVACUATION:\n• Follow ASDMA evacuation routes\n• Take emergency kit (documents, water, food, medicines)\n• Go to designated shelters\n\nASSAM FLOOD HELPLINE: 1800-345-3588\nASDMA: 0361-2237219",
  },
  {
    keywords: ["cyclone", "storm", "hurricane", "wind", "typhoon"],
    title: "Cyclone Safety",
    response: "During a Cyclone:\n\nBEFORE:\n• Secure loose objects outside\n• Stay indoors and away from windows\n• Stock 3-day supply of food and water\n• Keep battery-powered radio for updates\n\nDURING:\n• Stay in the strongest part of your building\n• If flooding occurs, go to upper floors\n• Do NOT go outside during the eye - storm will resume\n\nAFTER:\n• Wait for official all-clear\n• Watch for downed power lines\n\nMET DEPARTMENT: imd.gov.in | ASDMA: 1070",
  },
  {
    keywords: ["landslide", "mudslide", "slope", "hill", "debris"],
    title: "Landslide Safety",
    response: "During a Landslide:\n\nWARNING SIGNS:\n• Cracks in the ground or walls\n• Tilting trees, fences\n• Unusual sounds (cracking, rumbling)\n• Rapid water level changes in streams\n\nIMMEDIATELY:\n• Move away from the path quickly\n• Get to high, stable ground\n• Do NOT try to outrun a landslide\n• Avoid river valleys and low-lying areas\n\nAFTER:\n• Stay away from slide area\n• Watch for flooding (landslides often block waterways)\n\nNDRF Assam: 0361-2602285",
  },
  {
    keywords: ["fire", "burning", "blaze", "smoke", "flame"],
    title: "Fire Safety",
    response: "During a Fire:\n\nIMMEDIATELY:\n• ALERT everyone - raise alarm\n• EVACUATE via nearest exit (not elevator)\n• Call FIRE BRIGADE: 101\n• Close doors to slow fire spread\n\nIF TRAPPED:\n• Seal gaps in doors with cloth\n• Signal from windows\n• Stay low if smoke is present\n\nNEVER:\n• Use lifts during fire evacuation\n• Open doors that feel hot\n• Go back for belongings\n\nFire Brigade: 101 | Ambulance: 102",
  },
  {
    keywords: ["shelter", "camp", "relief camp", "stay", "evacuate", "nearest"],
    title: "Shelter Information",
    response: "Active Shelters in Assam:\n\n1. Dispur Relief Camp, Guwahati\n   - Capacity: 400 | Status: AVAILABLE\n   - Contact: +91 361-234-5678\n\n2. Kamrup District Shelter\n   - Capacity: 600 | Status: ALMOST FULL\n   - Contact: +91 361-234-5679\n\n3. Nalbari Relief Center\n   - Capacity: 800 | Status: FULL\n\n4. Jorhat Community Hall\n   - Capacity: 150 | Status: AVAILABLE\n   - Contact: +91 361-234-5681\n\nFor real-time availability, check the Shelter Management section.",
  },
  {
    keywords: ["kit", "emergency kit", "bag", "supplies", "prepare", "items"],
    title: "Emergency Kit Checklist",
    response: "Emergency Kit Essentials:\n\n WATER & FOOD:\n• 3-day water supply (4L/person/day)\n• Non-perishable food (3-day supply)\n• Can opener\n\n DOCUMENTS:\n• ID cards & Aadhaar\n• Insurance papers\n• Bank cards & cash\n\n HEALTH:\n• First aid kit\n• Prescription medicines (7-day supply)\n• Sanitation items\n\n TOOLS:\n• Flashlight + batteries\n• Battery radio\n• Whistle, multi-tool\n• Warm clothing & blanket\n• Waterproof phone case\n\nKeep kit in a waterproof bag and review every 6 months.",
  },
  {
    keywords: ["report", "incident", "submit", "how to report"],
    title: "Reporting a Disaster",
    response: "How to Report a Disaster Incident:\n\n1. Use this app:\n   - Go to 'Incident Reports' in the sidebar\n   - Fill in disaster type, location, severity\n   - Capture GPS or enter location manually\n   - Upload photos/videos if safe to do so\n   - Submit - ASDMA team will be notified\n\n2. Phone Reporting:\n   - ASDMA Helpline: 1070\n   - Police: 100\n   - Disaster Management: 0361-2237219\n\n3. Social Media:\n   - Tweet @ASDMA_Assam with #AssamDisaster\n\nInclude: Location, type of disaster, number of people affected.",
  },
  {
    keywords: ["sos", "help", "emergency", "danger", "rescue", "trapped"],
    title: "Emergency SOS",
    response: "EMERGENCY SOS:\n\nTO SEND AN SOS:\n• Open the 'SOS' button in the app\n• Confirm with a tap - your GPS location is automatically sent to ASDMA\n• A rescue team will be assigned within minutes\n\nEMERGENCY CONTACTS:\n• Police: 100\n• Ambulance: 102\n• Fire: 101\n• ASDMA Helpline: 1070\n• NDRF: 011-24363260\n\nIF TRAPPED:\n• Make noise at regular intervals\n• Use whistle or bright cloth to signal rescuers\n• Conserve phone battery - use airplane mode between checks",
  },
  {
    keywords: ["first aid", "injury", "wound", "bleeding", "cpr", "medical"],
    title: "First Aid Guide",
    response: "Basic First Aid:\n\nSEVERE BLEEDING:\n• Apply firm pressure with clean cloth\n• Elevate the limb if possible\n• Do NOT remove cloth if soaked - add more on top\n\nCPR (if person unresponsive, not breathing):\n• 30 chest compressions, 2 rescue breaths\n• Rate: 100-120 compressions/minute\n• Continue until help arrives\n\nHYPOTHERMIA (cold exposure):\n• Move to warm, dry location\n• Remove wet clothing\n• Warm with blankets starting from core\n\nALWAYS call 102 for serious injuries.\nNearest hospital info available at ASDMA website.",
  },
  {
    keywords: ["donation", "donate", "fund", "relief fund", "contribute"],
    title: "Relief Fund & Donations",
    response: "How to Donate for Disaster Relief:\n\n• Use the 'Relief Fund' section in this app\n• Choose a verified NGO campaign\n• Donate via UPI, net banking, or card\n\nVerified Organizations:\n• ASDMA Relief Fund - Official govt fund\n• Assam Relief Fund by Red Cross\n• Help Assam Foundation\n• Flood Relief Assam NGO\n\nAll donations are tax-exempt under 80G.\nYou will receive a donation receipt via email.\n\nFor ASDMA direct: donations@asdma.gov.in\nPM CARES: pmcares.gov.in",
  },
  {
    keywords: ["ngo", "organization", "register", "volunteer org"],
    title: "NGO Registration",
    response: "NGO & Organization Registration:\n\nTo register your organization:\n1. Go to 'NGO Registry' in the sidebar\n2. Fill organization details & area of operation\n3. Upload registration certificate\n4. Provide bank details for fund transfer\n5. Submit for ASDMA admin verification\n\nAfter verification (1-3 working days):\n• You can create relief campaigns\n• Request resource allocation\n• Coordinate with ASDMA directly\n\nContact: ngo@asdma.gov.in\nPhone: 0361-2237220",
  },
];

function getResponse(input) {
  const lower = input.toLowerCase().trim();
  if (!lower) return null;

  for (const item of KNOWLEDGE_BASE) {
    if (item.keywords.some(k => lower.includes(k))) {
      return item;
    }
  }
  return null;
}

const GREET = "Namaste! I am Suraksha AI Assistant. I can help you with:\n\n• Disaster safety guidelines\n• Emergency contacts\n• Shelter locations\n• Emergency kit preparation\n• How to report incidents\n• First aid basics\n\nAsk me anything related to disaster safety and emergency response.";

export default function DisasterChatbot({ embedded }) {
  const [open, setOpen] = useState(!!embedded);
  const [messages, setMessages] = useState([{ id: 0, from: "bot", text: GREET, time: new Date() }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  function send(text) {
    const q = text || input.trim();
    if (!q) return;
    setInput("");
    const userMsg = { id: Date.now(), from: "user", text: q, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    setTimeout(() => {
      const match = getResponse(q);
      const botText = match
        ? match.response
        : "I specialize in disaster safety and emergency response. I couldn't find specific information on that topic.\n\nTry asking about:\n• Flood / Earthquake / Cyclone / Landslide / Fire safety\n• Nearest shelters\n• Emergency kit checklist\n• How to send an SOS\n• First aid basics";
      setMessages(prev => [...prev, { id: Date.now() + 1, from: "bot", text: botText, time: new Date(), title: match?.title }]);
      setTyping(false);
    }, 900);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function reset() {
    setMessages([{ id: 0, from: "bot", text: GREET, time: new Date() }]);
  }

  const timeStr = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (embedded) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm flex flex-col" style={{ height: "600px" }}>
        <ChatHeader onReset={reset} />
        <ChatMessages messages={messages} typing={typing} bottomRef={bottomRef} />
        <QuickReplies onSelect={send} />
        <ChatInput input={input} setInput={setInput} onSend={() => send()} onKey={handleKey} />
      </div>
    );
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 1000, width: "56px", height: "56px", borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", boxShadow: "0 8px 24px rgba(37,99,235,0.4)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot style={{ width: "24px", height: "24px", color: "white" }} />
        </button>
      )}

      {open && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 1000, width: "360px", height: "520px", background: "white", borderRadius: "16px", boxShadow: "0 24px 64px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <ChatHeader onClose={() => setOpen(false)} onReset={reset} floating />
          <ChatMessages messages={messages} typing={typing} bottomRef={bottomRef} />
          <QuickReplies onSelect={send} />
          <ChatInput input={input} setInput={setInput} onSend={() => send()} onKey={handleKey} />
        </div>
      )}
    </>
  );
}

function ChatHeader({ onClose, onReset, floating }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #0f1e3d, #1d4ed8)", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Bot style={{ width: "18px", height: "18px", color: "white" }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "white", fontWeight: 700, fontSize: "14px", lineHeight: "1.2" }}>Suraksha AI</div>
        <div style={{ color: "#93c5fd", fontSize: "10px" }}>Disaster Safety Assistant • Online</div>
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <button onClick={onReset} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }} title="Reset chat">
          <RefreshCw style={{ width: "13px", height: "13px" }} />
        </button>
        {onClose && (
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
            <X style={{ width: "13px", height: "13px" }} />
          </button>
        )}
      </div>
    </div>
  );
}

function ChatMessages({ messages, typing, bottomRef }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px", background: "#f8fafc", display: "flex", flexDirection: "column", gap: "10px" }}>
      {messages.map(m => (
        <div key={m.id} style={{ display: "flex", flexDirection: m.from === "user" ? "row-reverse" : "row", gap: "8px", alignItems: "flex-start" }}>
          {m.from === "bot" && (
            <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#1d4ed8", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot style={{ width: "14px", height: "14px", color: "white" }} />
            </div>
          )}
          <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", gap: "2px", alignItems: m.from === "user" ? "flex-end" : "flex-start" }}>
            {m.from === "bot" && m.title && (
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#1d4ed8", marginBottom: "2px", paddingLeft: "2px" }}>{m.title}</div>
            )}
            <div style={{ background: m.from === "user" ? "#1d4ed8" : "white", color: m.from === "user" ? "white" : "#111827", borderRadius: m.from === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px", padding: "10px 12px", fontSize: "12px", lineHeight: "1.6", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", whiteSpace: "pre-wrap", border: m.from === "bot" ? "1px solid #e5e7eb" : "none" }}>
              {m.text}
            </div>
            <div style={{ fontSize: "9px", color: "#9ca3af", paddingLeft: "4px", paddingRight: "4px" }}>
              {m.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      ))}
      {typing && (
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#1d4ed8", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bot style={{ width: "14px", height: "14px", color: "white" }} />
          </div>
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "4px 14px 14px 14px", padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", display: "flex", gap: "5px", alignItems: "center" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#93c5fd", animation: "pulse 1.2s ease-in-out " + (i * 0.2) + "s infinite" }} />
            ))}
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function QuickReplies({ onSelect }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div style={{ padding: "8px 12px", borderTop: "1px solid #f1f5f9", background: "white" }}>
      <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "6px", fontWeight: 600 }}>QUICK QUESTIONS</div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
        {QUICK_REPLIES.slice(0, 4).map(q => (
          <button key={q} onClick={() => { onSelect(q); setVisible(false); }} style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "20px", border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", fontWeight: 500 }}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatInput({ input, setInput, onSend, onKey }) {
  return (
    <div style={{ padding: "10px 12px", borderTop: "1px solid #f1f5f9", background: "white", display: "flex", gap: "8px", alignItems: "flex-end" }}>
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKey}
        placeholder="Ask about disaster safety..."
        style={{ flex: 1, resize: "none", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "8px 12px", fontSize: "12px", lineHeight: "1.5", outline: "none", maxHeight: "80px", fontFamily: "inherit", color: "#111827" }}
        rows={1}
      />
      <button onClick={onSend} style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#1d4ed8", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Send style={{ width: "15px", height: "15px", color: "white" }} />
      </button>
    </div>
  );
}
