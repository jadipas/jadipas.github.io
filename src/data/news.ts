export type NewsItem = {
  date: string; // "2025-11-30"
  title: string; // short headline
  description?: string;
  link?: string;
};

export const news: NewsItem[] = [
  {
    date: "2025-10-24",
    title: "Best Paper Award at the Art of Robustness Workshop during IROS 2025",
    description:
      "Our paper on 'Multimodal Anomaly Detection for Human-Robot Interaction' received the Best Paper Award at the Art of Robustness Workshop held during IROS 2025 at Hangzhou, China.",
    link: "https://www.linkedin.com/posts/iordanis-antypas_iros2025-robotics-humanrobotinteraction-activity-7388632426425544705-qKvK?utm_source=share&utm_medium=member_desktop&rcm=ACoAADlVpo8BZG1MJxYnfrbwSJojE10irc3OpG8",
  },
];
