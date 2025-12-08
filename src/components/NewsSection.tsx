import React from "react";
import { motion } from "framer-motion";
import { news } from "../data/news";

const NewsSection: React.FC = () => {
  const sorted = [...news].sort((a, b) => (a.date < b.date ? 1 : -1));

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <section id="news" className="space-y-4 py-4">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">News</h2>
        <p className="text-sm text-accent-primary">
          Recent updates about my research, publications & projects.
        </p>
      </header>

      <motion.div
        className="border-l border-bg-surface pl-4 space-y-4"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={containerVariants}
      >
        {sorted.map((item, idx) => (
          <motion.article key={idx} className="relative" variants={itemVariants}>
            <div className="absolute -left-2 top-1 w-1 h-3 rounded-full bg-accent-light" />
            <p className="text-xs text-text-muted ml-2">
              {new Date(item.date).toLocaleDateString("en-GB", {
                month: "short",
                year: "numeric",
              })}
            </p>
            <h3 className="text-sm font-medium text-text-base">
              {item.title}
            </h3>
            {item.description && (
              <p className="text-xs text-accent-primary mt-1">
                {item.description}
              </p>
            )}
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs underline underline-offset-4 text-accent-light hover:text-text-base transition-colors"
              >
                Learn more
              </a>
            )}
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
};

export default NewsSection;
