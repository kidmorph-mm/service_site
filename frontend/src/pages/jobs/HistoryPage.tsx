import JobCard from "../../features/jobs/components/JobCard";
import { mockJobs } from "../../features/jobs/mock";

export default function HistoryPage() {
  return (
    <div style={{ maxWidth: 860 }}>
      <h1>History</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {mockJobs
          .slice()
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
      </div>
    </div>
  );
}