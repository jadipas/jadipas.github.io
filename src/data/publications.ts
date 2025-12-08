export type Publication = {
  title: string;
  authors: string;
  venue: string;
  year: number;
  type: "conference" | "journal" | "workshop" | "preprint";
  links?: {
    pdf?: string;
    arxiv?: string;
    code?: string;
  };
  highlight?: boolean;
};

export const publications: Publication[] = [
  {
    title:
      "Robot Trajectron+: An End-to-end Context-aware Assistive Controller for Robotic Manipulation",
    authors: "I. Antypas, P. Song",
    venue: "Master Thesis",
    year: 2024,
    type: "preprint",
    links: {
      code: "https://github.com/jadipas/RT-plus",
    },
    highlight: false,
  },
  
];
