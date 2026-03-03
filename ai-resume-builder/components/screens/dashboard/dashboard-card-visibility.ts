export const shouldShowCareerProfileEntryCard = ({
  hasLatestCareerProfile,
  recentResumeCount,
}: {
  hasLatestCareerProfile: boolean;
  recentResumeCount: number;
}): boolean => {
  if (hasLatestCareerProfile) return true;
  return Number(recentResumeCount || 0) > 0;
};

