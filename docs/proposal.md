# Shifa: Your Family's Lab Reports, Explained in Your Language

**Category:** AI in Healthcare
**Team:** Saad Mehmood · Talha Hamid · Eman Fatima · FAST-NUCES Lahore, 5th semester
**Keywords:** Medical Document AI · Urdu NLP · Lab Report Interpretation · Patient Safety · Health Literacy
**Prototype:** [GitHub repo](https://github.com/Saad-2006/Shifa) · [Live demo](https://shifa-silk.vercel.app) · [1-minute demo video](https://drive.google.com/file/d/1IRDkABoYs7Mnkvak60C10erqBNExcEZu/view?usp=drive_link)

---

## 1. Project Overview & Problem Statement

In Pakistan, lab reports arrive as a page of English abbreviations, numbers and reference ranges, usually on WhatsApp, often at night, and usually days before the next doctor's appointment. Families are left guessing:
- Is Ammi's result dangerous?
- Can it wait until Thursday?
- What should we even ask the doctor?

Three things make this worse:
- **Language and health literacy.** Most patients and their families read Urdu, not medical English. Terms like "HbA1c", "TLC" or "SGPT" mean nothing to them.
- **Chronic disease is common and needs repeated testing.** Some 33 million Pakistani adults (about 26%) live with diabetes ([IDF Diabetes Atlas 2021, via Health Policy Watch](https://healthpolicy-watch.news/pakistan-has-the-worlds-highest-diabetes-prevalence-and-lacks-focus-on-prevention)). Each of them collects reports month after month, and nobody connects the trend.
- **Doctor time is short.** Consultations are brief, so patients rarely get each value explained.

Generic chatbots are not the answer. They can misread numbers, invent values, or downplay a dangerous result.

## 2. Proposed Solution

**Shifa** is a chat-first assistant. A family member photographs a lab report and sends it in the chat. Shifa then:
1. **Reads the report:** AI vision transcribes every test, value, unit and printed normal range into structured data.
2. **Checks every value with verified rules, not AI:**
   - Deterministic code compares each value with the report's own printed range.
   - It checks a list of danger values (e.g. potassium, sodium, haemoglobin, glucose, platelets).
   - It assigns an urgency: **Urgent: get checked today / See a doctor this week / Mention at next visit / Normal**.
3. **Shows a verified report card** with the urgency and the values that need attention, each on a simple range bar.
4. **Explains it in the family's language,** English, Urdu or Roman Urdu. The family sets a preferred language once, and any answer can be shown in another language with one tap (e.g. a caretaker reads in English, then shows Ammi the Urdu). Code checks every translation: if any number changed, it isn't shown. The explanation is grounded only in that person's reports, and it can't override the code's flags.
5. **Answers follow-up questions** in the same chat ("Kya ye serious hai?", "Doctor se kya poochein?") and compares results over time.
6. **Handles emergencies calmly.** Code detects emergency words in English, Urdu and Roman Urdu, and danger values on reports. It shows a calm card in the chat whose main button sends a ready WhatsApp message to the family. Typed emergencies (chest pain, fainting) also get one "Call 1122" button. The AI alone can never raise an emergency.
7. **Prepares a one-page Doctor Summary** to print or share, so the consultation starts with the facts.

**Design principle: the AI reads and explains; code decides.** Every number shown is extracted from the report, and every flag and urgency level comes from code. The AI never decides what is dangerous.

## 3. Objectives & Expected Outcomes

**Objectives**
- Turn any Pakistani lab report into a clear, correct, language-appropriate explanation in under 15 seconds.
- Never miss a danger value: critical results always trigger an urgent message, whatever the AI says.
- Help families track chronic conditions (diabetes, anaemia, cholesterol, thyroid, kidney function) across reports.
- Make doctor visits more productive with a structured summary and good questions.

**Expected outcomes**
- **Reading accuracy, measured on 9 real reports from the three labs we target:** Chughtai (5), Shaukat Khanum (3) and Minhaj (1). They include CBCs, a 25-row urine test, diabetes tests and a hormone test.
  - **Method:** our evaluation tool (`npm run eval`) scores every value against labels taken from the printed report.
  - **Reading:** **66 of 66 values read exactly right**, every printed normal range matched (42/42), and no invented rows. It ignored "previous results" columns and a pregnancy-week table. About 3.4 seconds per report.
  - **Rules:** Shifa's rules then agreed with the meaning of **62 of 62** values.
  - **What the test caught:** the first run found 9 urine results the rules did not understand yet (e.g. "Nil" pus cells where the normal is "0-5/HPF"). We fixed the rules and locked them in with tests; that is how the evaluation loop is meant to work.
  - **Caveat:** it is a small set, and we are adding more reports before the finals.
- **Safety:** 100% of danger values flagged by the rule engine. This is verified by automated tests.
- Families understand their results without waiting for an appointment, and recognise emergencies sooner.

## 4. Target Users

- **Adult children managing their parents' health:** they receive the reports on WhatsApp and need to know how urgent things are.
- **Patients with chronic conditions** who test regularly: diabetes, hypertension-related kidney checks, thyroid, anaemia.
- **Low health-literacy and Urdu-first users,** including elderly patients. The interface uses large text, voice input and read-aloud, and an icon plus a word for every status.
- **Later:** clinics and labs that want to hand patients an explained report, and Lady Health Workers doing community follow-up.

## 5. Key Features / Deliverables

**Delivered in the prototype (Phase 1)**
| Feature | What the AI does | What code does |
|---|---|---|
| Report scanning (photo or PDF) in chat | Transcribes tests, values, units, ranges | Flags values, checks danger values, sets urgency, builds the report card |
| Explanations and follow-up chat | Explains in English / Urdu / Roman Urdu, grounded in the person's own reports | Supplies the verified flags, which the AI can't override |
| Emergency detection | Writes the calm advice in the reply | Keyword and fuzzy matching in three languages, and danger values, decide when the urgent card (WhatsApp to family, plus 1122 for typed emergencies) appears |
| Patient identity check | Reads the patient's name, age and sex from the report | Compares them with the chosen family member. On a mismatch, nothing is added until the user confirms whose report it is |
| WhatsApp alert | – | For code-decided emergencies only (a danger value, or emergency words): one tap opens WhatsApp with a code-written alert to a saved family number |
| Translate an answer (one tap) | Translates one of Shifa's answers into English / Urdu / Roman Urdu | Checks that every number survived unchanged (none lost or added); otherwise the translation is not shown. Saved, so showing it again costs nothing |
| Read aloud and voice input | – | Every answer can be read aloud; on phones without an Urdu voice, Urdu answers are read by the Hindi voice (same spoken words), with numbers checked by code |
| Ask with a report | Answers the question typed next to an attached or pasted report, inside the explanation | Keeps the report waiting until Send, so the question goes with it |
| Dark mode | – | System / Light / Dark themes, readable in all three languages |
| Trends & reports dashboard | – | Charts each test over time against its normal band, most urgent first (danger level, then well outside, then slightly outside), with every report one tap away. The laptop sidebar shows only the most urgent chart (or the latest change if all are normal) |
| Family profiles | – | Separate history per family member, stored only on the device |
| Doctor Summary | Writes one "In simple words" paragraph for the family | Printable one-page summary for the doctor; questions to ask in the family's language with English underneath; every number in the AI paragraph must come from the report, or it isn't shown |
| Accuracy evaluation | – | `npm run eval` scores the reading accuracy on hand-labelled real reports |

**Next milestone (Phase 2): medicines**
- Scan a medicine strip, box or prescription; the reading is matched against a verified database of Pakistani brands.
- Safety checks: the same active ingredient twice (e.g. Panadol + Panadol Extra), and daily-dose limits.
- Dose schedules from Pakistani notation like "1+0+1 × 5 din", with calendar and WhatsApp reminders.
- Automatic WhatsApp alerts through the WhatsApp Business API, once Meta verification and message templates are approved.

## 6. Implementation Plan & Timeline

**Architecture:** a Next.js web app that works on any phone, with no install.
- Server routes call Google Gemini: vision for transcription, streaming text for explanations.
- A deterministic TypeScript rule engine (`labRules.ts`) does all the checking.
- The emergency detector runs on the device as well as the server.
- Reports are stored only in the user's browser.

| Date | Milestone |
|---|---|
| Oct 10 | Idea, scope and architecture; core build (rule engine, extraction, chat, UI) |
| Oct 11 | Testing on real reports from several labs; accuracy evaluation; deployment |
| Oct 12 | Submission: proposal, GitHub repository, live demo, video |
| Oct 13–23 (if shortlisted) | Phase 2 medicines module; clinician review of danger values; user testing with families; Urdu voice polish |
| Oct 24 | Final live demonstration |

## 7. Resources or Requirements

- **AI:** Google Gemini API (Flash models; free tier for the prototype).
- **Hosting:** Vercel (free tier), GitHub.
- **Data:**
  - Real lab reports donated by our families, with names blurred, used for accuracy testing.
  - Two public Kaggle datasets of Pakistani medicines for Phase 2.
- **Expert input:** a doctor or pathologist to review the danger-value list and the explanation tone. We will seek this through mentorship if shortlisted.
- **Team:** 3 members: full-stack development, AI integration and prompt design, testing and data labelling.

## 8. Potential Challenges or Risks

| Risk | Mitigation |
|---|---|
| The AI misreads a value | Structured extraction; values shown next to the printed range so users can check; accuracy measured per lab (Chughtai, Minhaj, Shaukat Khanum); easy re-scan |
| A report is added to the wrong family member | Code checks the name, age and sex on the report and asks before adding anything that doesn't match |
| The AI gives unsafe medical advice | It never diagnoses or prescribes. Flags and urgency come from code, and the AI is instructed it can't override them. A disclaimer is always visible |
| A dangerous result is missed | Danger values are checked by code, independently of the AI, and covered by automated tests |
| Poor photos or unusual lab formats | PDF upload, retake guidance, and testing across several Pakistani labs |
| Privacy of medical data | No accounts. Reports are stored only on the user's device, and images are never stored |
| API limits or outages | Automatic model selection, rate limiting, and an offline demo mode |
| Urdu quality | Native-speaker review; the user can choose Roman Urdu or English |

## 9. Additional Details

- **Why it is not "just a chatbot":** the hybrid AI + rule-engine design is what makes it safe. The AI does what it is good at (reading messy documents, explaining kindly in Urdu), and code handles what must never go wrong (numbers, thresholds, emergencies).
- **Built for Pakistan:**
  - Urdu (right-to-left) and Roman Urdu as people actually type them.
  - Pakistani report formats, lakh-style numbers ("1,50,000").
  - One-tap WhatsApp alerts to family, and Rescue 1122 for emergencies happening right now.
- **Sustainability:** free for families; a paid version for labs and clinics to send patients pre-explained reports.
