# LogMentor

AI-powered log analysis tool for junior developers and CS students.

Paste or upload any log file and get a plain-English diagnosis, step-by-step fix guide, and an interactive chat to ask follow-up questions. Includes a debug challenge mode where you diagnose real log scenarios and get graded feedback.

![LogMentor screenshot](screenshot.png)

## Features

- Analyzes logs in any format (timestamp, JSON, Django, Node.js, bracket-style)
- AI diagnosis with root cause, fix steps, and glossary of technical terms
- Click any issue to drill down into a focused explanation
- Follow-up chat — ask questions about your specific log
- Debug challenge mode with beginner and intermediate scenarios
- File upload (drag & drop or browse) — .log, .txt, .json, .out

## Tech stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, TypeScript
- **Backend**: FastAPI, Python, OpenAI GPT-4o-mini
- **Key engineering**: smart log truncation before LLM (saves ~70% tokens), cache keyed on error fingerprints, multi-format log parser, compressed context on follow-up turns

## Running locally

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
cp .env.example .env          # then add your OpenAI key
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open http://localhost:3000