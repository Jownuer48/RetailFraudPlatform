import { useEffect, useMemo, useState } from "react";
import "./App.css";

const BACKEND_ROOT = "http://localhost:5233";
const API_ROOT = `${BACKEND_ROOT}/api`;
const ANALYSIS_API = `${API_ROOT}/Analysis`;
const CAMERAS_API = `${API_ROOT}/Cameras`;
const WORKERS_API = `${API_ROOT}/Workers`;
const STORES_API = `${API_ROOT}/Stores`;

const STATUS_META = {
  QUEUED: { label: "Queued", className: "status queued" },
  PROCESSING: { label: "Processing", className: "status processing" },
  COMPLETED: { label: "Completed", className: "status completed" },
  FAILED: { label: "Failed", className: "status failed" },
};

const REVIEW_STATUS_META = {
  NEEDS_REVIEW: { label: "Needs Review", className: "needs-review" },
  CONFIRMED: { label: "Confirmed", className: "confirmed" },
  FALSE_POSITIVE: { label: "False Positive", className: "false-positive" },
};

const NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "analyze", label: "Analyze" },
  { id: "jobs", label: "Jobs" },
  { id: "audit", label: "Audit" },
  { id: "system", label: "System Health" },
  { id: "cameras", label: "Cameras" },
];

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", { hour12: false });
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

function formatSecondsAgo(seconds) {
  if (seconds === null || seconds === undefined) return "-";

  if (seconds < 60) return `${Math.round(seconds)}s ago`;

  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds % 60);

  return `${minutes}m ${remainSeconds}s ago`;
}

function getStatusMeta(status) {
  return STATUS_META[status] ?? { label: status ?? "Unknown", className: "status unknown" };
}

function getReviewMeta(status) {
  return REVIEW_STATUS_META[status] ?? { label: status || "Needs Review", className: "needs-review" };
}

function getWorkerStatusMeta(status) {
  if (status === "ONLINE") return { label: "ONLINE", className: "online" };
  return { label: "OFFLINE", className: "offline" };
}

function getCameraHealthMeta(status) {
  if (status === "ONLINE") return { label: "ONLINE", className: "online" };
  return { label: "OFFLINE", className: "offline" };
}

function buildEvidenceUrl(record) {
  if (!record?.evidenceImageUrl) return "";
  if (String(record.evidenceImageUrl).startsWith("http")) return record.evidenceImageUrl;
  return `${BACKEND_ROOT}${record.evidenceImageUrl}`;
}

function buildEvidenceVideoUrl(record) {
  if (!record?.evidenceVideoUrl) return "";
  if (String(record.evidenceVideoUrl).startsWith("http")) return record.evidenceVideoUrl;
  return `${BACKEND_ROOT}${record.evidenceVideoUrl}`;
}

function App() {
  const [activePage, setActivePage] = useState("overview");

  const [transactionId, setTransactionId] = useState("TXN-CCTV-001");
  const [lastSubmittedJobId, setLastSubmittedJobId] = useState("");

  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("ALL");
  const [storeMessage, setStoreMessage] = useState("");

  const [cameraForm, setCameraForm] = useState({
    id: "CAM-COUNTER-01",
    storeId: "STORE-001",
    cameraName: "Counter Camera",
    sourceType: "FILE",
    sourceUrl: "test_normal.mp4",
    roiConfigJson: "[[150,150],[490,150],[490,480],[150,480]]",
    isActive: true,
  });

  const [editingCameraId, setEditingCameraId] = useState("");
  const [cameraManageMessage, setCameraManageMessage] = useState("");

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

  const filteredCameras = useMemo(() => {
    if (selectedStoreId === "ALL") return cameras;

    return cameras.filter((camera) => camera.storeId === selectedStoreId);
  }, [cameras, selectedStoreId]);

  const filteredCameraHealth = useMemo(() => {
    if (selectedStoreId === "ALL") return cameraHealth;

    return cameraHealth.filter((camera) => camera.storeId === selectedStoreId);
  }, [cameraHealth, selectedStoreId]);

  const filteredJobsByStore = useMemo(() => {
    if (selectedStoreId === "ALL") return jobs;

    return jobs.filter((job) => {
      const camera = cameras.find((item) => item.id === job.cameraId);
      return camera?.storeId === selectedStoreId;
    });
  }, [jobs, cameras, selectedStoreId]);

  const selectedStore = useMemo(() => {
    if (selectedStoreId === "ALL") return null;

    return stores.find((store) => store.id === selectedStoreId) ?? null;
  }, [stores, selectedStoreId]);

  const selectedCamera = useMemo(() => {
    return filteredCameras.find((camera) => camera.id === selectedCameraId) ?? null;
  }, [filteredCameras, selectedCameraId]);

  const selectedCameraHealth = useMemo(() => {
    return cameraHealth.find((camera) => camera.id === selectedCameraId) ?? null;
  }, [cameraHealth, selectedCameraId]);

  const lastSubmittedJob = useMemo(() => {
    if (!lastSubmittedJobId) return null;

    return (
      jobs.find(
        (job) =>
          String(job.id).toLowerCase() === String(lastSubmittedJobId).toLowerCase()
      ) ?? null
    );
  }, [jobs, lastSubmittedJobId]);

  const activeJobCount = useMemo(() => {
    return filteredJobsByStore.filter(
      (job) => job.status === "QUEUED" || job.status === "PROCESSING"
    ).length;
  }, [filteredJobsByStore]);

  const completedJobCount = useMemo(() => {
    return filteredJobsByStore.filter((job) => job.status === "COMPLETED").length;
  }, [filteredJobsByStore]);

  const failedJobCount = useMemo(() => {
    return filteredJobsByStore.filter((job) => job.status === "FAILED").length;
  }, [filteredJobsByStore]);

  const onlineWorkers = workerStatuses.filter((worker) => worker.status === "ONLINE");
  const primaryWorker = onlineWorkers[0] || workerStatuses[0] || null;
  const primaryWorkerMeta = getWorkerStatusMeta(primaryWorker?.status);

  const hasOnlineWorker = workerStatuses.some((worker) => worker.status === "ONLINE");
  const isSelectedCameraHealthy =
    selectedCameraHealth?.status === "ONLINE" && selectedCameraHealth?.isHealthy === true;
  const hasTransactionId = transactionId.trim().length > 0;

  const canStartAnalysis =
    hasTransactionId &&
    Boolean(selectedCameraId) &&
    hasOnlineWorker &&
    isSelectedCameraHealthy &&
    !isTriggering;

  const startBlockedReason = (() => {
    if (!hasTransactionId) return "Transaction ID is required";
    if (!selectedCameraId) return "Please select camera";
    if (!hasOnlineWorker) return "No AI Worker online";
    if (!selectedCameraHealth) return "Camera health not loaded";
    if (!isSelectedCameraHealthy) {
      return `Camera not ready: ${selectedCameraHealth.sourceStatus ?? "UNKNOWN"}`;
    }

    return "";
  })();

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

  const filteredHistory = useMemo(() => {
    return history.filter((record) => {
      const reviewStatus = record.reviewStatus || "NEEDS_REVIEW";
      const riskLevel = record.riskLevel || "UNKNOWN";

      const matchReview =
        reviewFilter === "ALL" || reviewStatus === reviewFilter;

      const matchRisk =
        riskFilter === "ALL" || riskLevel === riskFilter;

      const matchStore =
        selectedStoreId === "ALL" || record.cameraId
          ? selectedStoreId === "ALL" ||
          cameras.find((camera) => camera.id === record.cameraId)?.storeId ===
          selectedStoreId
          : selectedStoreId === "ALL";

      return matchReview && matchRisk && matchStore;
    });
  }, [history, reviewFilter, riskFilter, selectedStoreId, cameras]);

  async function fetchCameras() {
    const response = await fetch(CAMERAS_API);

    if (!response.ok) throw new Error(`Failed to fetch cameras: ${response.status}`);

    const data = await response.json();
    const cameraList = Array.isArray(data) ? data : [];

    setCameras(cameraList);

    if (!selectedCameraId && cameraList.length > 0) {
      setSelectedCameraId(cameraList[0].id);
    }
  }

  async function fetchStores() {
    try {
      const response = await fetch(STORES_API);

      if (!response.ok) {
        throw new Error("Failed to fetch stores");
      }

      const data = await response.json();

      setStores(Array.isArray(data) ? data : []);
      setStoreMessage("");
    } catch (error) {
      console.error(error);
      setStoreMessage("Failed to load stores");
    }
  }

  async function fetchJobs() {
    const response = await fetch(`${ANALYSIS_API}/jobs`);

    if (!response.ok) throw new Error(`Failed to fetch jobs: ${response.status}`);

    const data = await response.json();
    setJobs(Array.isArray(data) ? data : []);
  }

  async function fetchHistory() {
    const response = await fetch(`${ANALYSIS_API}/history`);

    if (!response.ok) throw new Error(`Failed to fetch history: ${response.status}`);

    const data = await response.json();
    setHistory(Array.isArray(data) ? data : []);
  }

  async function fetchQueueSummary() {
    try {
      setQueueLoading(true);
      const response = await fetch(`${ANALYSIS_API}/queue/summary`);
      if (!response.ok) throw new Error("Failed to fetch queue summary");
      const data = await response.json();
      setQueueSummary(data);
      setQueueMessage("");
    } catch (fetchError) {
      console.error(fetchError);
      setQueueMessage("Failed to load queue summary");
    } finally {
      setQueueLoading(false);
    }
  }

  async function fetchWorkerStatuses() {
    try {
      const response = await fetch(`${WORKERS_API}/status`);
      if (!response.ok) throw new Error("Failed to fetch worker statuses");
      const data = await response.json();
      setWorkerStatuses(Array.isArray(data) ? data : []);
      setWorkerMessage("");
    } catch (fetchError) {
      console.error(fetchError);
      setWorkerMessage("Failed to load worker status");
    }
  }

  async function fetchCameraHealth() {
    try {
      const response = await fetch(`${CAMERAS_API}/health`);
      if (!response.ok) throw new Error("Failed to fetch camera health");
      const data = await response.json();
      setCameraHealth(Array.isArray(data) ? data : []);
      setCameraHealthMessage("");
    } catch (fetchError) {
      console.error(fetchError);
      setCameraHealthMessage("Failed to load camera health");
    }
  }

  async function refreshAll({ silent = false, includeCameras = false } = {}) {
    if (!silent) setIsRefreshing(true);

    try {
      const tasks = [
        fetchHistory(),
        fetchJobs(),
        fetchQueueSummary(),
        fetchWorkerStatuses(),
        fetchCameraHealth(),
        fetchStores(),
      ];

      if (includeCameras) tasks.push(fetchCameras());

      await Promise.all(tasks);
    } catch (refreshError) {
      console.error(refreshError);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }

  async function requeueFailedJobs() {
    try {
      setQueueLoading(true);
      setQueueMessage("");

      const response = await fetch(`${ANALYSIS_API}/queue/requeue-failed?maxMessages=10`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to requeue failed jobs");
      }

      const result = await response.json();
      setQueueMessage(`Requeued ${result.movedCount} failed job(s)`);
      await fetchQueueSummary();
      await fetchJobs();
    } catch (queueError) {
      console.error(queueError);
      setQueueMessage("Failed to requeue jobs");
    } finally {
      setQueueLoading(false);
    }
  }

  async function clearOfflineWorkers() {
    try {
      setWorkerMessage("");

      const response = await fetch(`${WORKERS_API}/offline?olderThanMinutes=1`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to clear offline workers");
      }

      const result = await response.json();
      setWorkerMessage(`Cleared ${result.deletedCount} offline worker(s)`);
      await fetchWorkerStatuses();
    } catch (clearError) {
      console.error(clearError);
      setWorkerMessage("Failed to clear offline workers");
    }
  }

  async function updateFraudReview(recordId, reviewStatus, reviewNote = "") {
    try {
      setReviewBusyId(recordId);
      setReviewMessage("");

      const response = await fetch(`${ANALYSIS_API}/records/${recordId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus, reviewedBy: "pitpiboon", reviewNote }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Review update failed");
      }

      await fetchHistory();
      setReviewMessage(`Review updated: ${reviewStatus}`);
    } catch (reviewError) {
      console.error(reviewError);
      setReviewMessage("Review update failed");
    } finally {
      setReviewBusyId(null);
    }
  }

  async function triggerAnalysis(event) {
    event.preventDefault();

    setIsTriggering(true);
    setMessage("");
    setError("");

    try {
      if (!transactionId.trim()) throw new Error("Transaction ID is required");
      if (!selectedCameraId) throw new Error("Please select camera");
      if (!hasOnlineWorker) throw new Error("No AI Worker online. Please start the Python worker first.");
      if (!selectedCameraHealth) throw new Error("Camera health not loaded. Please refresh camera health.");
      if (!isSelectedCameraHealthy) {
        throw new Error(`Camera is not ready: ${selectedCameraHealth.sourceStatus ?? "UNKNOWN"}`);
      }

      const response = await fetch(`${ANALYSIS_API}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transactionId.trim(), cameraId: selectedCameraId }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data?.message ?? "Failed to trigger analysis");

      setLastSubmittedJobId(data.jobId ?? "");
      setMessage(
        `Job submitted: ${data.transactionId ?? transactionId} / ${data.cameraId ?? selectedCameraId}. Current status is shown below.`
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

  function resetCameraForm() {
    setEditingCameraId("");
    setCameraForm({
      id: "CAM-COUNTER-01",
      storeId: "STORE-001",
      cameraName: "Counter Camera",
      sourceType: "FILE",
      sourceUrl: "test_normal.mp4",
      roiConfigJson: "[[150,150],[490,150],[490,480],[150,480]]",
      isActive: true,
    });
  }

  function startEditCamera(camera) {
    setEditingCameraId(camera.id);
    setCameraForm({
      id: camera.id ?? "",
      storeId: camera.storeId ?? "",
      cameraName: camera.cameraName ?? "",
      sourceType: camera.sourceType ?? "FILE",
      sourceUrl: camera.sourceUrl ?? "",
      roiConfigJson: camera.roiConfigJson ?? "[[150,150],[490,150],[490,480],[150,480]]",
      isActive: Boolean(camera.isActive),
    });
    setActivePage("cameras");
  }

  async function saveCamera(event) {
    event.preventDefault();

    try {
      setCameraManageMessage("");

      const cameraId = editingCameraId || cameraForm.id.trim();

      if (!cameraId) throw new Error("Camera ID is required");
      if (!cameraForm.storeId.trim()) throw new Error("Store ID is required");
      if (!cameraForm.cameraName.trim()) throw new Error("Camera name is required");
      if (!cameraForm.sourceUrl.trim()) throw new Error("Source URL is required");
      if (cameraForm.roiConfigJson?.trim()) JSON.parse(cameraForm.roiConfigJson);

      const isEditing = Boolean(editingCameraId);
      const payload = {
        id: cameraId,
        storeId: cameraForm.storeId.trim(),
        cameraName: cameraForm.cameraName.trim(),
        sourceType: cameraForm.sourceType.trim().toUpperCase(),
        sourceUrl: cameraForm.sourceUrl.trim(),
        roiConfigJson: cameraForm.roiConfigJson,
        isActive: cameraForm.isActive,
      };

      const response = await fetch(isEditing ? `${CAMERAS_API}/${editingCameraId}` : CAMERAS_API, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to save camera");
      }

      setCameraManageMessage(isEditing ? "Camera updated" : "Camera created");
      resetCameraForm();
      await fetchCameras();
      await fetchCameraHealth();
    } catch (cameraError) {
      console.error(cameraError);
      setCameraManageMessage(cameraError.message ?? "Failed to save camera");
    }
  }

  async function deleteCamera(cameraId) {
    const confirmed = window.confirm(`Delete camera ${cameraId}?`);
    if (!confirmed) return;

    try {
      setCameraManageMessage("");

      const response = await fetch(`${CAMERAS_API}/${cameraId}`, { method: "DELETE" });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to delete camera");
      }

      setCameraManageMessage(`Camera deleted: ${cameraId}`);
      if (selectedCameraId === cameraId) setSelectedCameraId("");
      await fetchCameras();
      await fetchCameraHealth();
    } catch (deleteError) {
      console.error(deleteError);
      setCameraManageMessage(deleteError.message ?? "Failed to delete camera");
    }
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

  function renderStatsGrid() {
    return (
      <section className="stats-grid">
        <div className="stat-card">
          <span>Total Jobs</span>
          <strong>{filteredJobsByStore.length}</strong>
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
    );
  }

  function renderLatestResult() {
    return (
      <section className="panel">
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
            <div>
              <span>Review</span>
              <strong className={`review-badge ${getReviewMeta(history[0].reviewStatus).className}`}>
                {getReviewMeta(history[0].reviewStatus).label}
              </strong>
            </div>

            <p>{history[0].reason}</p>

            {history[0].evidenceImageUrl && (
              <a className="evidence-link" href={buildEvidenceUrl(history[0])} target="_blank" rel="noreferrer">
                <img className="evidence-preview" src={buildEvidenceUrl(history[0])} alt="Evidence snapshot" />
                <span>Open Evidence Snapshot</span>
              </a>
            )}

            {history[0].evidenceVideoUrl && (
              <div className="evidence-video-card">
                <video className="evidence-video" src={buildEvidenceVideoUrl(history[0])} controls />
                <a className="table-link" href={buildEvidenceVideoUrl(history[0])} target="_blank" rel="noreferrer">
                  Open Evidence Clip
                </a>
                {(history[0].evidenceClipStartSec !== null || history[0].evidenceClipEndSec !== null) && (
                  <span>
                    Clip Window: {history[0].evidenceClipStartSec ?? "-"}s - {history[0].evidenceClipEndSec ?? "-"}s
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  function renderAnalyzePage() {
    return (
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
              <input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="TXN-CCTV-001" />
            </label>

            <label>
              CCTV Camera
              <select value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)}>
                {filteredCameras.length === 0 ? (
                  <option value="">No cameras found</option>
                ) : (
                  filteredCameras.map((camera) => (
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
                <p>Source URL ถูกเก็บไว้ใน Camera Registry ฝั่ง Backend แล้ว หน้าเว็บไม่จำเป็นต้องให้ผู้ใช้กรอก path เอง</p>
              </div>
            )}

            <div className="preflight-card">
              <div className="preflight-header">
                <div>
                  <span>Preflight Check</span>
                  <strong>{canStartAnalysis ? "Ready to Analyze" : "Blocked"}</strong>
                </div>
                <span className={`preflight-badge ${canStartAnalysis ? "ready" : "blocked"}`}>
                  {canStartAnalysis ? "READY" : "NOT READY"}
                </span>
              </div>

              <div className="preflight-grid">
                <div className={hasTransactionId ? "preflight-item ready" : "preflight-item blocked"}>
                  <span>Transaction</span>
                  <strong>{hasTransactionId ? "OK" : "Missing"}</strong>
                </div>
                <div className={hasOnlineWorker ? "preflight-item ready" : "preflight-item blocked"}>
                  <span>AI Worker</span>
                  <strong>{hasOnlineWorker ? "ONLINE" : "OFFLINE"}</strong>
                </div>
                <div className={isSelectedCameraHealthy ? "preflight-item ready" : "preflight-item blocked"}>
                  <span>Camera</span>
                  <strong>{selectedCameraHealth?.sourceStatus ?? "NOT LOADED"}</strong>
                </div>
              </div>

              {!canStartAnalysis && <div className="preflight-reason">{startBlockedReason}</div>}
            </div>

            <div className="button-row">
              <button type="submit" disabled={!canStartAnalysis} title={startBlockedReason}>
                {isTriggering ? "Sending..." : "Start CCTV Analysis"}
              </button>
              <button type="button" className="secondary-button" onClick={generateNextTransactionId}>
                Generate ID
              </button>
              <button type="button" className="ghost-button" onClick={() => refreshAll({ includeCameras: true })} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </form>

          {message && <div className="alert success">{message}</div>}
          {error && <div className="alert error">{error}</div>}
        </div>

        {renderLatestResult()}

        {lastSubmittedJob && (
          <section className="panel current-job-card">
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
            {lastSubmittedJob.errorMessage && <p>{lastSubmittedJob.errorMessage}</p>}
          </section>
        )}
      </section>
    );
  }

  function renderJobsPage() {
    return (
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
              {filteredJobsByStore.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-row">No jobs found</td>
                </tr>
              ) : (
                filteredJobsByStore.map((job) => {
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
                      <td><span className={statusMeta.className}>{statusMeta.label}</span></td>
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
    );
  }

  function renderAuditPage() {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Fraud Audit</h2>
            <p>ตรวจสอบหลักฐาน ยืนยันเคส หรือ mark false positive</p>
          </div>
        </div>

        <div className="audit-summary-grid">
          <div className="audit-summary-card"><span>Total Cases</span><strong>{auditStats.total}</strong></div>
          <div className="audit-summary-card warning"><span>Needs Review</span><strong>{auditStats.needsReview}</strong></div>
          <div className="audit-summary-card danger"><span>Confirmed</span><strong>{auditStats.confirmed}</strong></div>
          <div className="audit-summary-card muted"><span>False Positive</span><strong>{auditStats.falsePositive}</strong></div>
          <div className="audit-summary-card danger"><span>High Risk</span><strong>{auditStats.highRisk}</strong></div>
        </div>

        <div className="audit-filter-bar">
          <label>
            Review
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
              <option value="ALL">All Reviews</option>
              <option value="NEEDS_REVIEW">Needs Review</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="FALSE_POSITIVE">False Positive</option>
            </select>
          </label>
          <label>
            Risk
            <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="ALL">All Risks</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
          <button type="button" className="clear-filter-button" onClick={() => { setReviewFilter("ALL"); setRiskFilter("ALL"); }}>
            Clear Filters
          </button>
        </div>

        {reviewMessage && <div className="review-message">{reviewMessage}</div>}

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
                <tr><td colSpan="12" className="empty-row">No history found</td></tr>
              ) : (
                filteredHistory.map((record) => (
                  <tr key={record.id}>
                    <td><strong>{record.transactionId}</strong></td>
                    <td>{record.cameraId ?? "-"}</td>
                    <td><span className={`risk-badge ${String(record.riskLevel).toLowerCase()}`}>{record.riskLevel}</span></td>
                    <td>{record.fraudScore}</td>
                    <td>{record.presenceTimeSec}s</td>
                    <td>{record.totalVideoSec}s</td>
                    <td>{record.reason}</td>
                    <td>
                      {record.evidenceImageUrl ? (
                        <a className="table-link" href={buildEvidenceUrl(record)} target="_blank" rel="noreferrer">Open</a>
                      ) : "-"}
                    </td>
                    <td>
                      {record.evidenceVideoUrl ? (
                        <a className="table-link" href={buildEvidenceVideoUrl(record)} target="_blank" rel="noreferrer">Clip</a>
                      ) : "-"}
                    </td>
                    <td>
                      <span className={`review-badge ${getReviewMeta(record.reviewStatus).className}`}>
                        {getReviewMeta(record.reviewStatus).label}
                      </span>
                    </td>
                    <td>
                      <div className="review-actions">
                        <button type="button" className="review-button confirm" disabled={reviewBusyId === record.id} onClick={() => updateFraudReview(record.id, "CONFIRMED", "Auditor confirmed this case from evidence.")}>Confirm</button>
                        <button type="button" className="review-button false-positive" disabled={reviewBusyId === record.id} onClick={() => updateFraudReview(record.id, "FALSE_POSITIVE", "Auditor marked this case as false positive.")}>False</button>
                        <button type="button" className="review-button reset" disabled={reviewBusyId === record.id} onClick={() => updateFraudReview(record.id, "NEEDS_REVIEW", "Review status reset.")}>Reset</button>
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
    );
  }

  function renderQueuePanel() {
    return (
      <section className="panel queue-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Message Queue</p>
            <h2>RabbitMQ Queue Monitor</h2>
          </div>
          <div className="queue-actions">
            <button type="button" className="queue-button" onClick={fetchQueueSummary} disabled={queueLoading}>Refresh</button>
            <button
              type="button"
              className="queue-button danger"
              onClick={requeueFailedJobs}
              disabled={queueLoading || !queueSummary?.failedQueue || queueSummary.failedQueue.messageCount <= 0}
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
          <div className={`queue-card failed ${(queueSummary?.failedQueue?.messageCount ?? 0) > 0 ? "has-failed" : ""}`}>
            <span>Failed Queue</span>
            <strong>{queueSummary?.failedQueue?.messageCount ?? 0}</strong>
            <small>{queueSummary?.failedQueue?.name ?? "fraud_failed_queue"}</small>
          </div>
        </div>

        {queueMessage && <div className="queue-message">{queueMessage}</div>}
      </section>
    );
  }

  function renderWorkerHealthPanel() {
    return (
      <section className="panel worker-health-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">AI Worker</p>
            <h2>Worker Health Monitor</h2>
          </div>
          <div className="queue-actions">
            <button type="button" className="queue-button" onClick={fetchWorkerStatuses}>Refresh Worker</button>
            <button type="button" className="queue-button danger" onClick={clearOfflineWorkers}>Clear Offline</button>
          </div>
        </div>

        {primaryWorker ? (
          <>
            <div className="worker-health-main">
              <div><span>Status</span><strong className={`worker-status-badge ${primaryWorkerMeta.className}`}>{primaryWorkerMeta.label}</strong></div>
              <div><span>Worker ID</span><strong>{primaryWorker.workerId}</strong></div>
              <div><span>Last Seen</span><strong>{formatSecondsAgo(primaryWorker.secondsSinceLastSeen)}</strong></div>
              <div><span>Processed</span><strong>{primaryWorker.processedJobs ?? 0}</strong></div>
              <div><span>Failed</span><strong>{primaryWorker.failedJobs ?? 0}</strong></div>
            </div>

            <div className="worker-current-job">
              <div><span>Current Job</span><strong>{primaryWorker.currentJobId ?? "None"}</strong></div>
              <div><span>Transaction</span><strong>{primaryWorker.currentTransactionId ?? "-"}</strong></div>
              <div><span>Camera</span><strong>{primaryWorker.currentCameraId ?? "-"}</strong></div>
            </div>

            {primaryWorker.lastError && <div className="worker-error">{primaryWorker.lastError}</div>}
          </>
        ) : (
          <div className="empty-row">No worker heartbeat received yet.</div>
        )}

        {workerMessage && <div className="queue-message">{workerMessage}</div>}

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
    );
  }

  function renderCameraHealthPanel() {
    return (
      <section className="panel camera-health-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">CCTV Source</p>
            <h2>Camera Health Monitor</h2>
          </div>
          <button type="button" className="queue-button" onClick={fetchCameraHealth}>Refresh Cameras</button>
        </div>

        {filteredCameraHealth.length === 0 ? (
          <div className="empty-row">No camera health data.</div>
        ) : (
          <div className="camera-health-grid">
            {filteredCameraHealth.map((camera) => {
              const meta = getCameraHealthMeta(camera.status);
              return (
                <div className={`camera-health-card ${meta.className}`} key={camera.id}>
                  <div className="camera-health-header">
                    <div>
                      <span>{camera.storeId}</span>
                      <strong>{camera.id}</strong>
                    </div>
                    <span className={`worker-status-badge ${meta.className}`}>{meta.label}</span>
                  </div>

                  <div className="camera-health-body">
                    <div><span>Name</span><strong>{camera.cameraName}</strong></div>
                    <div><span>Source Type</span><strong>{camera.sourceType}</strong></div>
                    <div><span>Source Status</span><strong>{camera.sourceStatus}</strong></div>
                    <div><span>Last Check</span><strong>{formatDateTime(camera.lastCheckedAtUtc)}</strong></div>
                  </div>

                  {camera.errorMessage && <div className="camera-health-error">{camera.errorMessage}</div>}
                </div>
              );
            })}
          </div>
        )}

        {cameraHealthMessage && <div className="queue-message">{cameraHealthMessage}</div>}
      </section>
    );
  }

  function renderSystemHealthPage() {
    return (
      <div className="page-stack">
        {renderQueuePanel()}
        {renderWorkerHealthPanel()}
        {renderCameraHealthPanel()}
      </div>
    );
  }

  function renderCamerasPage() {
    return (
      <div className="page-stack">
        <section className="panel camera-registry-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Camera Registry</p>
              <h2>Manage CCTV Cameras</h2>
            </div>
            <button type="button" className="queue-button" onClick={resetCameraForm}>New Camera</button>
          </div>

          <form className="camera-form" onSubmit={saveCamera}>
            <div className="camera-form-grid">
              <label>
                Camera ID
                <input
                  value={cameraForm.id}
                  disabled={Boolean(editingCameraId)}
                  onChange={(event) => setCameraForm((current) => ({ ...current, id: event.target.value }))}
                  placeholder="CAM-COUNTER-01"
                />
              </label>

              <label>
                Store ID
                <input value={cameraForm.storeId} onChange={(event) => setCameraForm((current) => ({ ...current, storeId: event.target.value }))} placeholder="STORE-001" />
              </label>

              <label>
                Camera Name
                <input value={cameraForm.cameraName} onChange={(event) => setCameraForm((current) => ({ ...current, cameraName: event.target.value }))} placeholder="Counter Camera" />
              </label>

              <label>
                Source Type
                <select value={cameraForm.sourceType} onChange={(event) => setCameraForm((current) => ({ ...current, sourceType: event.target.value }))}>
                  <option value="FILE">FILE</option>
                  <option value="RTSP">RTSP</option>
                </select>
              </label>

              <label className="wide-field">
                Source URL
                <input value={cameraForm.sourceUrl} onChange={(event) => setCameraForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="test_normal.mp4 หรือ rtsp://..." />
              </label>

              <label className="wide-field">
                ROI Config JSON
                <textarea value={cameraForm.roiConfigJson} onChange={(event) => setCameraForm((current) => ({ ...current, roiConfigJson: event.target.value }))} rows={3} />
              </label>

              <label className="camera-checkbox">
                <input type="checkbox" checked={cameraForm.isActive} onChange={(event) => setCameraForm((current) => ({ ...current, isActive: event.target.checked }))} />
                Active Camera
              </label>
            </div>

            <div className="button-row">
              <button type="submit">{editingCameraId ? "Update Camera" : "Create Camera"}</button>
              <button type="button" className="secondary-button" onClick={resetCameraForm}>Reset</button>
            </div>
          </form>

          {cameraManageMessage && <div className="queue-message">{cameraManageMessage}</div>}

          <div className="camera-registry-list">
            {filteredCameras.length === 0 ? (
              <div className="empty-row">No cameras found</div>
            ) : (
              filteredCameras.map((camera) => (
                <div className="camera-registry-item" key={camera.id}>
                  <div>
                    <strong>{camera.id}</strong>
                    <span>{camera.cameraName} / {camera.storeId} / {camera.sourceType}</span>
                  </div>
                  <div className="queue-actions">
                    <button type="button" className="queue-button" onClick={() => startEditCamera(camera)}>Edit</button>
                    <button type="button" className="queue-button danger" onClick={() => deleteCamera(camera.id)}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {renderCameraHealthPanel()}
      </div>
    );
  }

  function renderOverviewPage() {
    return (
      <div className="page-stack">
        {renderStatsGrid()}
        <section className="overview-grid">
          {renderLatestResult()}
          <section className="panel overview-status-panel">
            <div className="panel-header">
              <div>
                <h2>System Snapshot</h2>
                <p>ภาพรวมสถานะระบบตอนนี้</p>
              </div>
            </div>

            <div className="overview-status-grid">
              <div className={hasOnlineWorker ? "preflight-item ready" : "preflight-item blocked"}>
                <span>AI Worker</span>
                <strong>{hasOnlineWorker ? "ONLINE" : "OFFLINE"}</strong>
              </div>
              <div className={isSelectedCameraHealthy ? "preflight-item ready" : "preflight-item blocked"}>
                <span>Selected Camera</span>
                <strong>{selectedCameraHealth?.sourceStatus ?? "NOT LOADED"}</strong>
              </div>
              <div className="preflight-item ready">
                <span>Main Queue</span>
                <strong>{queueSummary?.mainQueue?.messageCount ?? 0}</strong>
              </div>
              <div className={(queueSummary?.failedQueue?.messageCount ?? 0) > 0 ? "preflight-item blocked" : "preflight-item ready"}>
                <span>Failed Queue</span>
                <strong>{queueSummary?.failedQueue?.messageCount ?? 0}</strong>
              </div>
            </div>
          </section>
        </section>
      </div>
    );
  }

  function renderActivePage() {
    switch (activePage) {
      case "analyze":
        return renderAnalyzePage();
      case "jobs":
        return renderJobsPage();
      case "audit":
        return renderAuditPage();
      case "system":
        return renderSystemHealthPage();
      case "cameras":
        return renderCamerasPage();
      case "overview":
      default:
        return renderOverviewPage();
    }
  }

  return (
    <main className="app-layout-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span>Retail CCTV AI</span>
          <strong>Control Center</strong>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activePage === item.id ? "active" : ""}
              onClick={() => setActivePage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>{hasOnlineWorker ? "Worker online" : "Worker offline"}</span>
          <strong>{selectedCameraId || "No camera"}</strong>
        </div>
      </aside>

      <section className="app-page-shell">
        <section className="hero-section compact-hero">
          <div>
            <h1>AI CCTV Fraud Analysis Dashboard</h1>
            <p className="hero-text">
              ระบบตรวจจับความผิดปกติจากกล้องวงจรปิด โดยใช้ Camera Registry, RabbitMQ, Python AI Worker, YOLO และ ASP.NET Core API
            </p>
          </div>

          <div className="system-health-card">
            <p>Pipeline Status</p>
            <strong>{hasOnlineWorker ? "Online" : "Degraded"}</strong>
            <span>{canStartAnalysis ? "Ready to analyze" : startBlockedReason || "Monitoring"}</span>
          </div>
        </section>

        <section className="panel store-filter-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Branch Scope</p>
              <h2>Store Filter</h2>
            </div>

            <button
              type="button"
              className="queue-button"
              onClick={fetchStores}
            >
              Refresh Stores
            </button>
          </div>

          <div className="store-filter-row">
            <label>
              Store
              <select
                value={selectedStoreId}
                onChange={(event) => {
                  setSelectedStoreId(event.target.value);
                  setSelectedCameraId("");
                }}
              >
                <option value="ALL">All Stores</option>

                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.id} - {store.storeName}
                  </option>
                ))}
              </select>
            </label>

            <div className="store-filter-summary">
              <span>Current Scope</span>
              <strong>
                {selectedStore ? `${selectedStore.id} / ${selectedStore.storeName}` : "All Stores"}
              </strong>
            </div>
          </div>

          {storeMessage && <div className="queue-message">{storeMessage}</div>}
        </section>

        {renderActivePage()}
      </section>
    </main>
  );
}

export default App;
