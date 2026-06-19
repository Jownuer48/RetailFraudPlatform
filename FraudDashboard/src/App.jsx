import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://localhost:5233/api/Analysis";

const STATUS_META = {
  QUEUED: {
    label: "Queued",
    className: "status queued",
  },
  PROCESSING: {
    label: "Processing",
    className: "status processing",
  },
  COMPLETED: {
    label: "Completed",
    className: "status completed",
  },
  FAILED: {
    label: "Failed",
    className: "status failed",
  },
};

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    hour12: false,
  });
}

function formatDuration(job) {
  if (!job?.startedAtUtc || !job?.finishedAtUtc) return "-";

  const start = new Date(job.startedAtUtc);
  const finish = new Date(job.finishedAtUtc);

  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
    return "-";
  }

  const diffSec = Math.max(0, Math.round((finish - start) / 1000));
  return `${diffSec}s`;
}

function getStatusMeta(status) {
  return STATUS_META[status] ?? {
    label: status ?? "Unknown",
    className: "status unknown",
  };
}

function App() {
  const [transactionId, setTransactionId] = useState("TXN-MEGA-006");
  const [videoPath, setVideoPath] = useState(
    "C:\\Users\\ASUS\\RetailFraudPlatform\\FraudAI\\test_normal.mp4"
  );

  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);

  const [isTriggering, setIsTriggering] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeJobCount = useMemo(() => {
    return jobs.filter(
      (job) => job.status === "QUEUED" || job.status === "PROCESSING"
    ).length;
  }, [jobs]);

  const completedJobCount = useMemo(() => {
    return jobs.filter((job) => job.status === "COMPLETED").length;
  }, [jobs]);

  const failedJobCount = useMemo(() => {
    return jobs.filter((job) => job.status === "FAILED").length;
  }, [jobs]);

  async function fetchJobs() {
    const response = await fetch(`${API_BASE_URL}/jobs`);

    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.status}`);
    }

    const data = await response.json();
    setJobs(Array.isArray(data) ? data : []);
  }

  async function fetchHistory() {
    const response = await fetch(`${API_BASE_URL}/history`);

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }

    const data = await response.json();
    setHistory(Array.isArray(data) ? data : []);
  }

  async function refreshAll(options = { silent: false }) {
    try {
      if (!options.silent) {
        setIsRefreshing(true);
      }

      await Promise.all([fetchJobs(), fetchHistory()]);
      setError("");
    } catch (refreshError) {
      console.error(refreshError);
      setError(refreshError.message ?? "Refresh failed");
    } finally {
      if (!options.silent) {
        setIsRefreshing(false);
      }
    }
  }

  async function triggerAnalysis(event) {
    event.preventDefault();

    setIsTriggering(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId,
          videoPath,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? "Failed to trigger analysis");
      }

      setMessage(
        `Job created: ${data.transactionId ?? transactionId} (${data.status ?? "QUEUED"})`
      );

      await refreshAll({ silent: true });
    } catch (triggerError) {
      console.error(triggerError);
      setError(triggerError.message ?? "Trigger failed");
    } finally {
      setIsTriggering(false);
    }
  }

  function generateNextTransactionId() {
    const now = new Date();
    const suffix = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
    setTransactionId(`TXN-MEGA-${suffix}`);
  }

  useEffect(() => {
    refreshAll({ silent: true });
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshAll({ silent: true });
    }, 3000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <main className="app-shell">
      <section className="hero-section">
        <div>
          <p className="eyebrow">Retail Fraud Detection Platform</p>
          <h1>AI CCTV Fraud Analysis Dashboard</h1>
          <p className="hero-text">
            ระบบวิเคราะห์วิดีโอผ่าน RabbitMQ + Python AI Worker + ASP.NET Core API
            พร้อมติดตามสถานะงานแบบ polling
          </p>
        </div>

        <div className="system-health-card">
          <p>Pipeline Status</p>
          <strong>Online</strong>
          <span>Polling every 3 seconds</span>
        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <span>Total Jobs</span>
          <strong>{jobs.length}</strong>
        </div>

        <div className="stat-card">
          <span>Active</span>
          <strong>{activeJobCount}</strong>
        </div>

        <div className="stat-card">
          <span>Completed</span>
          <strong>{completedJobCount}</strong>
        </div>

        <div className="stat-card">
          <span>Failed</span>
          <strong>{failedJobCount}</strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Trigger Analysis</h2>
              <p>ส่งงานวิเคราะห์วิดีโอเข้า RabbitMQ queue</p>
            </div>
          </div>

          <form className="trigger-form" onSubmit={triggerAnalysis}>
            <label>
              Transaction ID
              <input
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                placeholder="TXN-MEGA-006"
              />
            </label>

            <label>
              Video Path
              <textarea
                value={videoPath}
                onChange={(event) => setVideoPath(event.target.value)}
                placeholder="C:\Users\ASUS\RetailFraudPlatform\FraudAI\test_normal.mp4"
                rows={4}
              />
            </label>

            <div className="button-row">
              <button type="submit" disabled={isTriggering}>
                {isTriggering ? "Sending..." : "Start Analysis"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={generateNextTransactionId}
              >
                Generate ID
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={() => refreshAll()}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </form>

          {message && <div className="alert success">{message}</div>}
          {error && <div className="alert error">{error}</div>}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Latest Fraud Result</h2>
              <p>ผลวิเคราะห์ล่าสุดจาก AI Worker</p>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="empty-state">ยังไม่มีผลวิเคราะห์</div>
          ) : (
            <div className="latest-result">
              <div>
                <span>Transaction</span>
                <strong>{history[0].transactionId}</strong>
              </div>

              <div>
                <span>Risk Level</span>
                <strong className={`risk ${String(history[0].riskLevel).toLowerCase()}`}>
                  {history[0].riskLevel}
                </strong>
              </div>

              <div>
                <span>Fraud Score</span>
                <strong>{history[0].fraudScore}</strong>
              </div>

              <div>
                <span>Presence Time</span>
                <strong>{history[0].presenceTimeSec}s</strong>
              </div>

              <p>{history[0].reason}</p>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Analysis Jobs</h2>
            <p>ติดตามสถานะงาน QUEUED / PROCESSING / COMPLETED / FAILED</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Status</th>
                <th>Created</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>

            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-row">
                    No jobs found
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const statusMeta = getStatusMeta(job.status);

                  return (
                    <tr key={job.id}>
                      <td>
                        <div className="transaction-cell">
                          <strong>{job.transactionId}</strong>
                          <span>{job.id}</span>
                        </div>
                      </td>

                      <td>
                        <span className={statusMeta.className}>
                          {statusMeta.label}
                        </span>
                      </td>

                      <td>{formatDateTime(job.createdAtUtc)}</td>
                      <td>{formatDateTime(job.startedAtUtc)}</td>
                      <td>{formatDateTime(job.finishedAtUtc)}</td>
                      <td>{formatDuration(job)}</td>
                      <td className="error-cell">{job.errorMessage ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Fraud History</h2>
            <p>ผลลัพธ์ที่ Worker วิเคราะห์เสร็จและบันทึกลง SQL Server</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Risk</th>
                <th>Score</th>
                <th>Presence</th>
                <th>Total Video</th>
                <th>Reason</th>
                <th>Created</th>
              </tr>
            </thead>

            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-row">
                    No history found
                  </td>
                </tr>
              ) : (
                history.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.transactionId}</strong>
                    </td>
                    <td>
                      <span className={`risk-badge ${String(record.riskLevel).toLowerCase()}`}>
                        {record.riskLevel}
                      </span>
                    </td>
                    <td>{record.fraudScore}</td>
                    <td>{record.presenceTimeSec}s</td>
                    <td>{record.totalVideoSec}s</td>
                    <td>{record.reason}</td>
                    <td>{formatDateTime(record.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default App;