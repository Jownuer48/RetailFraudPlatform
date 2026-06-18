\# Retail Fraud Detection Platform



An end-to-end fraud detection platform that combines CCTV video analysis, asynchronous background processing, and a web dashboard.



This project simulates a retail fraud detection workflow where a transaction event is sent to a backend API, queued through RabbitMQ, processed by an AI worker using YOLO-based video analysis, and stored in SQL Server for dashboard visualization.



\## System Architecture



```text

React Dashboard

&#x20;     |

&#x20;     | POST /api/Analysis/trigger

&#x20;     v

ASP.NET Core Web API

&#x20;     |

&#x20;     | Publish job

&#x20;     v

RabbitMQ Queue

&#x20;     |

&#x20;     | Consume job

&#x20;     v

Python AI Worker

&#x20;     |

&#x20;     | YOLO Video Analysis

&#x20;     v

ASP.NET Core Webhook

&#x20;     |

&#x20;     | Save result

&#x20;     v

SQL Server

```



\## Features



\* React dashboard for triggering fraud analysis

\* ASP.NET Core Web API backend

\* RabbitMQ asynchronous job queue

\* Python AI worker for video processing

\* YOLO-based person detection and tracking

\* ROI-based suspicious behavior detection

\* SQL Server database persistence

\* Docker Compose setup for RabbitMQ and SQL Server

\* Fraud history API for dashboard display



\## Tech Stack



\### Frontend



\* React

\* Vite

\* CSS



\### Backend



\* ASP.NET Core Web API

\* Entity Framework Core

\* SQL Server

\* RabbitMQ



\### AI Worker



\* Python

\* OpenCV

\* Ultralytics YOLO

\* Supervision

\* Pika

\* Requests



\### Infrastructure



\* Docker

\* Docker Compose

\* RabbitMQ Management UI

\* SQL Server 2022



\## Project Structure



```text

RetailFraudPlatform/

├── FraudAPI/          # ASP.NET Core backend

├── FraudAI/           # Python AI worker

├── FraudDashboard/    # React dashboard

├── docker-compose.yml

├── .env.example

└── README.md

```



\## Local Development Setup



\### 1. Clone the repository



```bash

git clone https://github.com/vip48nuer/RetailFraudPlatform.git

cd RetailFraudPlatform

```



\### 2. Create environment file



Create a `.env` file from `.env.example`.



```bash

copy .env.example .env

```



Update the values inside `.env` as needed.



\### 3. Start infrastructure services



```bash

docker compose up -d

```



Services:



\* RabbitMQ AMQP: `localhost:5673`

\* RabbitMQ Management UI: `http://localhost:15673`

\* SQL Server: `localhost,1433`



\### 4. Run ASP.NET Core API



```bash

cd FraudAPI

dotnet run

```



Default API URL:



```text

http://localhost:5233

```



\### 5. Run Python AI worker



```bash

cd FraudAI

python -m venv venv

venv\\Scripts\\activate

pip install -r requirements.txt

python worker.py

```



\### 6. Run React dashboard



```bash

cd FraudDashboard

npm install

npm run dev

```



\## Main API Endpoints



```text

POST /api/Analysis/trigger

POST /api/Analysis/result

GET  /api/Analysis/history

```



\## Current Fraud Detection Logic



The AI worker analyzes a video and checks how long a detected person stays inside a predefined ROI area.



A transaction is marked as high risk when the customer presence time is suspiciously low.



Example result:



```json

{

&#x20; "transactionId": "TXN-001",

&#x20; "riskLevel": "HIGH",

&#x20; "fraudScore": 95,

&#x20; "presenceTimeSec": 2.3,

&#x20; "totalVideoSec": 20.0,

&#x20; "reason": "Customer presence is suspiciously low."

}

```



\## Notes



This project is designed as a local development prototype and portfolio project. Sensitive configuration files such as `.env`, Python virtual environments, node modules, model weights, and test videos are intentionally excluded from Git.



\## Future Improvements



\* Add job status tracking: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`

\* Add retry and dead-letter queue handling

\* Add authentication for dashboard and API

\* Add camera stream support

\* Add object detection for suspicious item movement

\* Dockerize backend, frontend, and AI worker

\* Add deployment pipeline



