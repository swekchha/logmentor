# LogMentor

AI-powered log analysis tool for junior developers and CS students.

Paste or upload any log file and get a plain-English diagnosis, step-by-step fix guide, and an interactive chat to ask follow-up questions. Includes a debug challenge mode where you diagnose real log scenarios and get graded feedback.

## LogMentor Overview

<img width="1903" height="910" alt="image" src="https://github.com/user-attachments/assets/604a409d-db8f-4543-beaf-cb1fcb65808d" />

<img width="659" height="881" alt="image" src="https://github.com/user-attachments/assets/e5eee189-2f1d-4e7a-b09c-92d9edae1091" />

<img width="1899" height="903" alt="image" src="https://github.com/user-attachments/assets/0aeb12d6-e9b8-4690-9f6f-cc0abc3cd493" />

<img width="1250" height="900" alt="image" src="https://github.com/user-attachments/assets/b70188d8-9290-4fa7-a77b-de16aa3a05db" />

<img width="1224" height="779" alt="image" src="https://github.com/user-attachments/assets/157c2a1f-7318-480e-96e2-f963e03e8fdb" />

<img width="1206" height="612" alt="image" src="https://github.com/user-attachments/assets/b718f6e7-7ac5-406e-a7ab-acaa51f7b7c2" />

<img width="1911" height="448" alt="image" src="https://github.com/user-attachments/assets/9d073f54-68b8-454b-9ac3-88aca432bc1e" />

<img width="1262" height="807" alt="image" src="https://github.com/user-attachments/assets/edfe1140-99fc-452e-9360-163fce0f25c3" />

<img width="1227" height="903" alt="image" src="https://github.com/user-attachments/assets/16af6552-2077-4911-b301-5936d906c28e" />









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
