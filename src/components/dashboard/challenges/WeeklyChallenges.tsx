import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import EmptyState from "@/components/ui/EmptyState";

interface Challenge {
  challengeId: string;
  title: string;
  description: string;
  icon: string;
  type: string;
  goal: number;
  xpReward: number;
  bonusPerk: string | null;
  difficulty: string;
  progress: number;
  completed: boolean;
  completedAt: Date | null;
}

interface ChallengesResponse {
  data?: Challenge[];
}

export default function WeeklyChallenges() {
  const { data, isLoading: loading } = useSWR<ChallengesResponse>("/api/challenges", fetcher);
  const challenges = data?.data || [];

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <div className="loading"></div>
      </div>
    );
  }

  if (challenges.length === 0) {
    return (
      <EmptyState
        emoji="🏆"
        title="No Challenges This Week"
        description="Check back next week for new challenges!"
      />
    );
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "EASY":
        return "bg-green-500";
      case "MEDIUM":
        return "bg-yellow-500";
      case "HARD":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case "EASY":
        return "Easy";
      case "MEDIUM":
        return "Medium";
      case "HARD":
        return "Hard";
      default:
        return difficulty;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Weekly Challenges</h2>
        <span className="text-sm text-[var(--color-text-secondary)]">
          Complete challenges to earn XP and rewards!
        </span>
      </div>

      {challenges.map((challenge) => {
        const progressPercentage = Math.min(
          100,
          (challenge.progress / challenge.goal) * 100
        );

        return (
          <div
            key={challenge.challengeId}
            className={`card p-6 border border-[var(--color-border)] rounded-2xl ${
              challenge.completed
                ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                : "bg-[var(--color-bg-secondary)]"
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="text-4xl">{challenge.icon}</div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    {challenge.title}
                    {challenge.completed && (
                      <span className="ml-2 text-green-600 dark:text-green-400 text-sm">
                        ✓ Completed
                      </span>
                    )}
                  </h3>
                  <p className="text-[var(--color-text-secondary)] text-sm">
                    {challenge.description}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-[var(--color-accent)]">
                  +{challenge.xpReward} XP
                </div>
                {challenge.bonusPerk && (
                  <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {challenge.bonusPerk}
                  </div>
                )}
                <div
                  className={`inline-block px-2 py-1 rounded text-xs font-medium text-white mt-2 ${getDifficultyColor(
                    challenge.difficulty
                    )}`}
                >
                  {getDifficultyLabel(challenge.difficulty)}
                </div>
              </div>
            </div>

            <div className="mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--color-text-secondary)]">
                  Progress
                </span>
                <span className="font-medium">
                  {challenge.progress} / {challenge.goal}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    challenge.completed
                      ? "bg-green-500"
                      : "bg-[var(--color-accent)]"
                  }`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {challenge.completed && challenge.completedAt && (
              <div className="text-xs text-[var(--color-text-secondary)] mt-2">
                Completed on {new Date(challenge.completedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
