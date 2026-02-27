import JobCard from "../../features/jobs/components/JobCard";
import { isInQueue, mockJobs } from "../../features/jobs/mock";

export default function QueuePage() {
  const queue = mockJobs.filter((j) => isInQueue(j.status));

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>Queue</h1>
      <p style={{ color: "#555" }}>Jobs that are queued or currently running.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {queue.length === 0 ? <div>No queued/running jobs.</div> : queue.map((job) => <JobCard key={job.id} job={job} />)}
      </div>
    </div>
  );
}