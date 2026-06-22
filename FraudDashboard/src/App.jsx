import { useEffect, useMemo, useState } from "react";
import "./App.css";

const BACKEND_ROOT = "http://localhost:5233";
const API_ROOT = `${BACKEND_ROOT}/api`;
const ANALYSIS_API = `${API_ROOT}/Analysis`;
const CAMERAS_API = `${API_ROOT}/Cameras`;

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
  return (
    STATUS_META[status] ?? {
      label: status ?? "Unknown",
      className: "status unknown",
    }
  );
}
//image url ที่ได้จาก backend อาจจะเป็น full url หรือ path ที่ต้องต่อกับ BACKEND_ROOT อีกที
function buildEvidenceUrl(record) {
  if (!record?.evidenceImageUrl) return "";

  if (String(record.evidenceImageUrl).startsWith("http")) {
    return record.evidenceImageUrl;
  }

  return `${BACKEND_ROOT}${record.evidenceImageUrl}`;
}
//video url ที่ได้จาก backend อาจจะเป็น full url หรือ path ที่ต้องต่อกับ BACKEND_ROOT อีกที
function buildEvidenceVideoUrl(record) {
  if (!record?.evidenceVideoUrl) return "";

  if (String(record.evidenceVideoUrl).startsWith("http")) {
    return record.evidenceVideoUrl;
  }

  return `${BACKEND_ROOT}${record.evidenceVideoUrl}`;
}

function App() {
  const [transactionId, setTransactionId] = useState("TXN-CCTV-001");
  const [lastSubmittedJobId, setLastSubmittedJobId] = useState("");

  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);

  const [isTriggering, setIsTriggering] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCamera = useMemo(() => {
    return cameras.find((camera) => camera.id === selectedCameraId) ?? null;
  }, [cameras, selectedCameraId]);

  const lastSubmittedJob = useMemo(() => {
    if (!lastSubmittedJobId) return null;

    return (
      jobs.find(
        (job) =>
          String(job.id).toLowerCase() ===
          String(lastSubmittedJobId).toLowerCase()
      ) ?? null
    );
  }, [jobs, lastSubmittedJobId]);

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

  async function fetchCameras() {
    const response = await fetch(CAMERAS_API);

    if (!response.ok) {
      throw new Error(`Failed to fetch cameras: ${response.status}`);
    }

    const data = await response.json();
    const cameraList = Array.isArray(data) ? data : [];

    setCameras(cameraList);

    if (!selectedCameraId && cameraList.length > 0) {
      setSelectedCameraId(cameraList[0].id);
    }
  }

  async function fetchJobs() {
    const response = await fetch(`${ANALYSIS_API}/jobs`);

    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.status}`);
    }

    const data = await response.json();
    setJobs(Array.isArray(data) ? data : []);
  }

  async function fetchHistory() {
    const response = await fetch(`${ANALYSIS_API}/history`);

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }

    const data = await response.json();
    setHistory(Array.isArray(data) ? data : []);
  }

  async function refreshAll(options = { silent: false, includeCameras: false }) {
    try {
      if (!options.silent) {
        setIsRefreshing(true);
      }

      if (options.includeCameras) {
        await Promise.all([fetchCameras(), fetchJobs(), fetchHistory()]);
      } else {
        await Promise.all([fetchJobs(), fetchHistory()]);
      }

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
      if (!transactionId.trim()) {
        throw new Error("Transaction ID is required");
      }

      if (!selectedCameraId) {
        throw new Error("Please select camera");
      }

      const response = await fetch(`${ANALYSIS_API}/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId: transactionId.trim(),
          cameraId: selectedCameraId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? "Failed to trigger analysis");
      }

      setLastSubmittedJobId(data.jobId ?? "");

      setMessage(
        `Job submitted: ${data.transactionId ?? transactionId} / ${data.cameraId ?? selectedCameraId
        }. Current status is shown below.`
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

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const second = String(now.getSeconds()).padStart(2, "0");

    setTransactionId(`TXN-CCTV-${year}${month}${day}-${hour}${minute}${second}`);
  }

  useEffect(() => {
    refreshAll({ silent: true, includeCameras: true });
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
          <h1>AI CCTV Fraud Analysis Dashboard</h1>
          <p className="hero-text">
            ระบบตรวจจับความผิดปกติจากกล้องวงจรปิด โดยใช้ Camera Registry,
            RabbitMQ, Python AI Worker, YOLO และ ASP.NET Core API
          </p>
        </div>

        <div className="system-health-card">
          <p>Pipeline Status</p>
          <strong>Online</strong>
          <span>Camera-based analysis</span>
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
              <h2>Trigger CCTV Analysis</h2>
              <p>เลือกกล้องวงจรปิด แล้วส่งงานวิเคราะห์เข้า RabbitMQ queue</p>
            </div>
          </div>

          <form className="trigger-form" onSubmit={triggerAnalysis}>
            <label>
              Transaction ID
              <input
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                placeholder="TXN-CCTV-001"
              />
            </label>

            <label>
              CCTV Camera
              <select
                value={selectedCameraId}
                onChange={(event) => setSelectedCameraId(event.target.value)}
              >
                {cameras.length === 0 ? (
                  <option value="">No cameras found</option>
                ) : (
                  cameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.id} - {camera.cameraName} ({camera.storeId})
                    </option>
                  ))
                )}
              </select>
            </label>

            {selectedCamera && (
              <div className="camera-info-card">
                <div>
                  <span>Store</span>
                  <strong>{selectedCamera.storeId}</strong>
                </div>

                <div>
                  <span>Camera</span>
                  <strong>{selectedCamera.cameraName}</strong>
                </div>

                <div>
                  <span>Source Type</span>
                  <strong>{selectedCamera.sourceType}</strong>
                </div>

                <div>
                  <span>Status</span>
                  <strong className={selectedCamera.isActive ? "online" : "offline"}>
                    {selectedCamera.isActive ? "Active" : "Inactive"}
                  </strong>
                </div>

                <p>
                  Source URL ถูกเก็บไว้ใน Camera Registry ฝั่ง Backend แล้ว
                  หน้าเว็บไม่จำเป็นต้องให้ผู้ใช้กรอก path เอง
                </p>
              </div>
            )}

            <div className="button-row">
              <button
                type="submit"
                disabled={isTriggering || !selectedCameraId}
              >
                {isTriggering ? "Sending..." : "Start CCTV Analysis"}
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
                onClick={() =>
                  refreshAll({ includeCameras: true })
                }
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </form>

          {lastSubmittedJob && (
            <div className="current-job-card">
              <div>
                <span>Current Job</span>
                <strong>{lastSubmittedJob.transactionId}</strong>
              </div>

              <div>
                <span>Camera</span>
                <strong>{lastSubmittedJob.cameraId ?? "-"}</strong>
              </div>

              <div>
                <span>Status</span>
                <strong>
                  <span className={getStatusMeta(lastSubmittedJob.status).className}>
                    {getStatusMeta(lastSubmittedJob.status).label}
                  </span>
                </strong>
              </div>

              <div>
                <span>Started</span>
                <strong>{formatDateTime(lastSubmittedJob.startedAtUtc)}</strong>
              </div>

              <div>
                <span>Finished</span>
                <strong>{formatDateTime(lastSubmittedJob.finishedAtUtc)}</strong>
              </div>

              <div>
                <span>Duration</span>
                <strong>{formatDuration(lastSubmittedJob)}</strong>
              </div>

              {lastSubmittedJob.errorMessage && (
                <p>{lastSubmittedJob.errorMessage}</p>
              )}
            </div>
          )}

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
                <strong
                  className={`risk ${String(
                    history[0].riskLevel
                  ).toLowerCase()}`}
                >
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
              {history[0].evidenceImageUrl && (
                <a
                  className="evidence-link"
                  href={buildEvidenceUrl(history[0])}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    className="evidence-preview"
                    src={buildEvidenceUrl(history[0])}
                    alt="Evidence snapshot"
                  />
                  <span>Open Evidence Snapshot</span>
                </a>
              )}

              {history[0].evidenceVideoUrl && (
                <div className="evidence-video-card">
                  <video
                    className="evidence-video"
                    src={buildEvidenceVideoUrl(history[0])}
                    controls
                  />

                  <a
                    className="table-link"
                    href={buildEvidenceVideoUrl(history[0])}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Evidence Clip
                  </a>

                  {(history[0].evidenceClipStartSec !== null ||
                    history[0].evidenceClipEndSec !== null) && (
                      <span>
                        Clip Window: {history[0].evidenceClipStartSec ?? "-"}s -{" "}
                        {history[0].evidenceClipEndSec ?? "-"}s
                      </span>
                    )}
                </div>
              )}
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
                <th>Camera</th>
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
                  <td colSpan="8" className="empty-row">
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

                      <td>{job.cameraId ?? "-"}</td>

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
                <th>Evidence</th>
                <th>Clip</th>
                <th>Created</th>
              </tr>
            </thead>

            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-row">
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
                      <span
                        className={`risk-badge ${String(
                          record.riskLevel
                        ).toLowerCase()}`}
                      >
                        {record.riskLevel}
                      </span>
                    </td>

                    <td>{record.fraudScore}</td>
                    <td>{record.presenceTimeSec}s</td>
                    <td>{record.totalVideoSec}s</td>
                    <td>{record.reason}</td>
                    <td>
                      {record.evidenceImageUrl ? (
                        <a
                          className="table-link"
                          href={buildEvidenceUrl(record)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {record.evidenceVideoUrl ? (
                        <a
                          className="table-link"
                          href={buildEvidenceVideoUrl(record)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Clip
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
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