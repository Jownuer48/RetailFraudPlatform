import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [transactionId, setTransactionId] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [result, setResult] = useState(null);

  const handleAnalyze = async () => {
    try {
      // ยิงไปที่ C# Backend (พอร์ตที่เราใช้งานอยู่คือ 5233)
      const response = await axios.post('http://localhost:5233/api/Analysis/trigger', {
        transactionId: transactionId,
        videoPath: videoPath
      });
      setResult(response.data);
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ!");
      console.error(error);
    }
  };

  return (
    <div className="App">
      <h1>Retail Fraud Dashboard</h1>
      <div className="input-group">
        <input placeholder="Transaction ID" onChange={(e) => setTransactionId(e.target.value)} />
        <input placeholder="Video Path" onChange={(e) => setVideoPath(e.target.value)} />
        <button onClick={handleAnalyze}>Analyze Now</button>
      </div>

      {result && (
        <div className="result-card">
          <h2>Result</h2>
          <p>Risk Level: <strong>{result.riskLevel}</strong></p>
          <p>Score: {result.fraudScore}</p>
          <p>Reason: {result.reason}</p>
        </div>
      )}
    </div>
  );
}

export default App;