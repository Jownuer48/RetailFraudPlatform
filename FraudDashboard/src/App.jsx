import { useEffect, useMemo, useState } from "react";
import "./App.css";

const BACKEND_ROOT = "http://localhost:5233";
const API_ROOT = `${BACKEND_ROOT}/api`;
const ANALYSIS_API = `${API_ROOT}/Analysis`;
const CAMERAS_API = `${API_ROOT}/Cameras`;
const WORKERS_API = `${API_ROOT}/Workers`;

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

//helper function สำหรับแสดง label และ className ของ review status
const REVIEW_STATUS_META = {
  NEEDS_REVIEW: {
    label: "Needs Review",
    className: "needs-review",
  },
  CONFIRMED: {
    label: "Confirmed",
    className: "confirmed",
  },
  FALSE_POSITIVE: {
    label: "False Positive",
    className: "false-positive",
  },
};

function getReviewMeta(status) {
  return (
    REVIEW_STATUS_META[status] || {
      label: status || "Needs Review",
      className: "needs-review",
    }
  );
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

function formatSecondsAgo(seconds) {
  if (seconds === null || seconds === undefined) return "-";

  if (seconds < 60) {
    return `${Math.round(seconds)}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds % 60);

  return `${minutes}m ${remainSeconds}s ago`;
}

function getWorkerStatusMeta(status) {
  if (status === "ONLINE") {
    return {
      label: "ONLINE",
      className: "online",
    };
  }

  return {
    label: "OFFLINE",
    className: "offline",
  };
}

function getCameraHealthMeta(status) {
  if (status === "ONLINE") {
    return {
      label: "ONLINE",
      className: "online",
    };
  }

  return {
    label: "OFFLINE",
    className: "offline",
  };
}

function App() {
  const [transactionId, setTransactionId] = useState("TXN-CCTV-001");
  const [lastSubmittedJobId, setLastSubmittedJobId] = useState("");

  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  const [history, setHistory] = useState([]);
  const [jobs, setJobs] = useState([]);

  const [reviewBusyId, setReviewBusyId] = useState(null);
  const [reviewMessage, setReviewMessage] = useState("");

  const [queueSummary, setQueueSummary] = useState(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [workerStatuses, setWorkerStatuses] = useState([]);
  const [workerMessage, setWorkerMessage] = useState("");

  const [cameraHealth, setCameraHealth] = useState([]);
  const [cameraHealthMessage, setCameraHealthMessage] = useState("");

  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");

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

  async function fetchCameraHealth() {
    try {
      const response = await fetch(`${CAMERAS_API}/health`);

      if (!response.ok) {
        throw new Error("Failed to fetch camera health");
      }

      const data = await response.json();

      setCameraHealth(Array.isArray(data) ? data : []);
      setCameraHealthMessage("");
    } catch (error) {
      console.error(error);
      setCameraHealthMessage("Failed to load camera health");
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

  async function fetchQueueSummary() {
    try {
      setQueueLoading(true);

      const response = await fetch(`${ANALYSIS_API}/queue/summary`);

      if (!response.ok) {
        throw new Error("Failed to fetch queue summary");
      }

      const data = await response.json();
      setQueueSummary(data);
    } catch (error) {
      console.error(error);
      setQueueMessage("Failed to load queue summary");
    } finally {
      setQueueLoading(false);
    }
  }

  async function fetchWorkerStatuses() {
    try {
      const response = await fetch(`${WORKERS_API}/status`);

      if (!response.ok) {
        throw new Error("Failed to fetch worker statuses");
      }

      const data = await response.json();

      setWorkerStatuses(Array.isArray(data) ? data : []);
      setWorkerMessage("");
    } catch (error) {
      console.error(error);
      setWorkerMessage("Failed to load worker status");
    }
  }

  async function clearOfflineWorkers() {
    try {
      setWorkerMessage("");

      const response = await fetch(
        `${WORKERS_API}/offline?olderThanMinutes=1`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to clear offline workers");
      }

      const result = await response.json();

      setWorkerMessage(`Cleared ${result.deletedCount} offline worker(s)`);

      await fetchWorkerStatuses();
    } catch (error) {
      console.error(error);
      setWorkerMessage("Failed to clear offline workers");
    }
  }

  async function requeueFailedJobs() {
    try {
      setQueueLoading(true);
      setQueueMessage("");

      const response = await fetch(
        `${ANALYSIS_API}/queue/requeue-failed?maxMessages=10`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to requeue failed jobs");
      }

      const result = await response.json();

      setQueueMessage(`Requeued ${result.movedCount} failed job(s)`);

      await fetchQueueSummary();
      await fetchJobs();
    } catch (error) {
      console.error(error);
      setQueueMessage("Failed to requeue jobs");
    } finally {
      setQueueLoading(false);
    }
  }

  async function fetchHistory() {
    const response = await fetch(`${ANALYSIS_API}/history`);

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }

    const data = await response.json();
    setHistory(Array.isArray(data) ? data : []);
  }

  const filteredHistory = useMemo(() => {
    return history.filter((record) => {
      const reviewStatus = record.reviewStatus || "NEEDS_REVIEW";
      const riskLevel = record.riskLevel || "UNKNOWN";

      const matchReview =
        reviewFilter === "ALL" || reviewStatus === reviewFilter;

      const matchRisk =
        riskFilter === "ALL" || riskLevel === riskFilter;

      return matchReview && matchRisk;
    });
  }, [history, reviewFilter, riskFilter]);

  const auditStats = useMemo(() => {
    return history.reduce(
      (acc, record) => {
        const reviewStatus = record.reviewStatus || "NEEDS_REVIEW";
        const riskLevel = record.riskLevel || "UNKNOWN";

        acc.total += 1;

        if (reviewStatus === "NEEDS_REVIEW") acc.needsReview += 1;
        if (reviewStatus === "CONFIRMED") acc.confirmed += 1;
        if (reviewStatus === "FALSE_POSITIVE") acc.falsePositive += 1;
        if (riskLevel === "HIGH") acc.highRisk += 1;
        if (riskLevel === "MEDIUM") acc.mediumRisk += 1;
        if (riskLevel === "LOW") acc.lowRisk += 1;

        return acc;
      },
      {
        total: 0,
        needsReview: 0,
        confirmed: 0,
        falsePositive: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
      }
    );
  }, [history]);

  async function updateFraudReview(recordId, reviewStatus, reviewNote = "") {
    try {
      setReviewBusyId(recordId);
      setReviewMessage("");

      const response = await fetch(`${ANALYSIS_API}/records/${recordId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewStatus,
          reviewedBy: "pitpiboon",
          reviewNote,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Review update failed");
      }

      await fetchHistory();

      setReviewMessage(`Review updated: ${reviewStatus}`);
    } catch (error) {
      console.error(error);
      setReviewMessage("Review update failed");
    } finally {
      setReviewBusyId(null);
    }
  }

  async function refreshAll({ silent = false, includeCameras = false } = {}) {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const tasks = [
        fetchHistory(),
        fetchJobs(),
        fetchQueueSummary(),
        fetchWorkerStatuses(),
        fetchCameraHealth(),
      ];

      if (includeCameras) {
        tasks.push(fetchCameras());
      }

      await Promise.all(tasks);
    } catch (error) {
      console.error(error);
    } finally {
      if (!silent) {
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

  const onlineWorkers = workerStatuses.filter(
    (worker) => worker.status === "ONLINE"
  );

  const primaryWorker = onlineWorkers[0] || workerStatuses[0] || null;

  const primaryWorkerMeta = getWorkerStatusMeta(primaryWorker?.status);

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

              <div>
                <span>Review</span>
                <strong
                  className={`review-badge ${getReviewMeta(history[0].reviewStatus).className
                    }`}
                >
                  {getReviewMeta(history[0].reviewStatus).label}
                </strong>
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
            <div className="audit-summary-grid">
              <div className="audit-summary-card">
                <span>Total Cases</span>
                <strong>{auditStats.total}</strong>
              </div>

              <div className="audit-summary-card warning">
                <span>Needs Review</span>
                <strong>{auditStats.needsReview}</strong>
              </div>

              <div className="audit-summary-card danger">
                <span>Confirmed</span>
                <strong>{auditStats.confirmed}</strong>
              </div>

              <div className="audit-summary-card muted">
                <span>False Positive</span>
                <strong>{auditStats.falsePositive}</strong>
              </div>

              <div className="audit-summary-card danger">
                <span>High Risk</span>
                <strong>{auditStats.highRisk}</strong>
              </div>
            </div>
            <div className="audit-filter-bar">
              <label>
                Review
                <select
                  value={reviewFilter}
                  onChange={(event) => setReviewFilter(event.target.value)}
                >
                  <option value="ALL">All Reviews</option>
                  <option value="NEEDS_REVIEW">Needs Review</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="FALSE_POSITIVE">False Positive</option>
                </select>
              </label>

              <label>
                Risk
                <select
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value)}
                >
                  <option value="ALL">All Risks</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </label>

              <button
                type="button"
                className="clear-filter-button"
                onClick={() => {
                  setReviewFilter("ALL");
                  setRiskFilter("ALL");
                }}
              >
                Clear Filters
              </button>
            </div>

            {/* ------------------------------------- */}
            {/* 1. RabbitMQ Queue Monitor Panel */}
            {/* ------------------------------------- */}
            <section className="panel queue-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Message Queue</p>
                  <h2>RabbitMQ Queue Monitor</h2>
                </div>

                <div className="queue-actions">
                  <button
                    type="button"
                    className="queue-button"
                    onClick={fetchQueueSummary}
                    disabled={queueLoading}
                  >
                    Refresh
                  </button>

                  <button
                    type="button"
                    className="queue-button danger"
                    onClick={requeueFailedJobs}
                    disabled={
                      queueLoading ||
                      !queueSummary?.failedQueue ||
                      queueSummary.failedQueue.messageCount <= 0
                    }
                  >
                    Requeue Failed
                  </button>
                </div>
              </div>

              <div className="queue-summary-grid">
                <div className="queue-card">
                  <span>Main Queue</span>
                  <strong>{queueSummary?.mainQueue?.messageCount ?? 0}</strong>
                  <small>{queueSummary?.mainQueue?.name ?? "fraud_queue"}</small>
                </div>

                <div
                  className={`queue-card failed ${(queueSummary?.failedQueue?.messageCount ?? 0) > 0 ? "has-failed" : ""
                    }`}
                >
                  <span>Failed Queue</span>
                  <strong>{queueSummary?.failedQueue?.messageCount ?? 0}</strong>
                  <small>{queueSummary?.failedQueue?.name ?? "fraud_failed_queue"}</small>
                </div>
              </div>

              {queueMessage && <div className="queue-message">{queueMessage}</div>}
            </section>

            {/* ------------------------------------- */}
            {/* 2. Worker Health Monitor Panel */}
            {/* ------------------------------------- */}
            <section className="panel worker-health-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">AI Worker</p>
                  <h2>Worker Health Monitor</h2>
                </div>

                <div className="queue-actions">
                  <button
                    type="button"
                    className="queue-button"
                    onClick={fetchWorkerStatuses}
                  >
                    Refresh Worker
                  </button>

                  <button
                    type="button"
                    className="queue-button danger"
                    onClick={clearOfflineWorkers}
                  >
                    Clear Offline
                  </button>
                </div>
              </div>

              {primaryWorker ? (
                <>
                  <div className="worker-health-main">
                    <div>
                      <span>Status</span>
                      <strong
                        className={`worker-status-badge ${primaryWorkerMeta.className}`}
                      >
                        {primaryWorkerMeta.label}
                      </strong>
                    </div>

                    <div>
                      <span>Worker ID</span>
                      <strong>{primaryWorker.workerId}</strong>
                    </div>

                    <div>
                      <span>Last Seen</span>
                      <strong>{formatSecondsAgo(primaryWorker.secondsSinceLastSeen)}</strong>
                    </div>

                    <div>
                      <span>Processed</span>
                      <strong>{primaryWorker.processedJobs ?? 0}</strong>
                    </div>

                    <div>
                      <span>Failed</span>
                      <strong>{primaryWorker.failedJobs ?? 0}</strong>
                    </div>
                  </div>

                  <div className="worker-current-job">
                    <div>
                      <span>Current Job</span>
                      <strong>{primaryWorker.currentJobId ?? "None"}</strong>
                    </div>

                    <div>
                      <span>Transaction</span>
                      <strong>{primaryWorker.currentTransactionId ?? "-"}</strong>
                    </div>

                    <div>
                      <span>Camera</span>
                      <strong>{primaryWorker.currentCameraId ?? "-"}</strong>
                    </div>
                  </div>

                  {primaryWorker.lastError && (
                    <div className="worker-error">
                      {primaryWorker.lastError}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-row">
                  No worker heartbeat received yet.
                </div>
              )}

              {workerMessage && (
                <div className="queue-message">
                  {workerMessage}
                </div>
              )}

              {workerStatuses.length > 1 && (
                <div className="worker-list">
                  {workerStatuses.map((worker) => {
                    const meta = getWorkerStatusMeta(worker.status);

                    return (
                      <div className="worker-list-item" key={worker.workerId}>
                        <span className={`worker-dot ${meta.className}`} />
                        <strong>{worker.workerId}</strong>
                        <span>{meta.label}</span>
                        <span>{formatSecondsAgo(worker.secondsSinceLastSeen)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="panel camera-health-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">CCTV Source</p>
                  <h2>Camera Health Monitor</h2>
                </div>

                <button
                  type="button"
                  className="queue-button"
                  onClick={fetchCameraHealth}
                >
                  Refresh Cameras
                </button>
              </div>

              {cameraHealth.length === 0 ? (
                <div className="empty-row">No camera health data.</div>
              ) : (
                <div className="camera-health-grid">
                  {cameraHealth.map((camera) => {
                    const meta = getCameraHealthMeta(camera.status);

                    return (
                      <div
                        className={`camera-health-card ${meta.className}`}
                        key={camera.id}
                      >
                        <div className="camera-health-header">
                          <div>
                            <span>{camera.storeId}</span>
                            <strong>{camera.id}</strong>
                          </div>

                          <span className={`worker-status-badge ${meta.className}`}>
                            {meta.label}
                          </span>
                        </div>

                        <div className="camera-health-body">
                          <div>
                            <span>Name</span>
                            <strong>{camera.cameraName}</strong>
                          </div>

                          <div>
                            <span>Source Type</span>
                            <strong>{camera.sourceType}</strong>
                          </div>

                          <div>
                            <span>Source Status</span>
                            <strong>{camera.sourceStatus}</strong>
                          </div>

                          <div>
                            <span>Last Check</span>
                            <strong>{formatDateTime(camera.lastCheckedAtUtc)}</strong>
                          </div>
                        </div>

                        {camera.errorMessage && (
                          <div className="camera-health-error">
                            {camera.errorMessage}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {cameraHealthMessage && (
                <div className="queue-message">
                  {cameraHealthMessage}
                </div>
              )}
            </section>

            <h2>Fraud History</h2>
            {reviewMessage && (
              <div className="review-message">
                {reviewMessage}
              </div>
            )}
            <p>ผลลัพธ์ที่ Worker วิเคราะห์เสร็จและบันทึกลง SQL Server</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Camera</th>
                <th>Risk</th>
                <th>Score</th>
                <th>Presence</th>
                <th>Total Video</th>
                <th>Reason</th>
                <th>Evidence</th>
                <th>Clip</th>
                <th>Review</th>
                <th>Action</th>
                <th>Created</th>
              </tr>
            </thead>

            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="12" className="empty-row">
                    No history found
                  </td>
                </tr>
              ) : (
                filteredHistory.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.transactionId}</strong>
                    </td>

                    <td>{record.cameraId ?? "-"}</td>

                    <td>
                      <span
                        className={`risk-badge ${String(record.riskLevel).toLowerCase()}`}
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
                    <td>
                      <span
                        className={`review-badge ${getReviewMeta(record.reviewStatus).className
                          }`}
                      >
                        {getReviewMeta(record.reviewStatus).label}
                      </span>
                    </td>

                    <td>
                      <div className="review-actions">
                        <button
                          type="button"
                          className="review-button confirm"
                          disabled={reviewBusyId === record.id}
                          onClick={() =>
                            updateFraudReview(
                              record.id,
                              "CONFIRMED",
                              "Auditor confirmed this case from evidence."
                            )
                          }
                        >
                          Confirm
                        </button>

                        <button
                          type="button"
                          className="review-button false-positive"
                          disabled={reviewBusyId === record.id}
                          onClick={() =>
                            updateFraudReview(
                              record.id,
                              "FALSE_POSITIVE",
                              "Auditor marked this case as false positive."
                            )
                          }
                        >
                          False
                        </button>

                        <button
                          type="button"
                          className="review-button reset"
                          disabled={reviewBusyId === record.id}
                          onClick={() =>
                            updateFraudReview(
                              record.id,
                              "NEEDS_REVIEW",
                              "Review status reset."
                            )
                          }
                        >
                          Reset
                        </button>
                      </div>
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