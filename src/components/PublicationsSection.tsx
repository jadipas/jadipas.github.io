import React from "react";
import { motion } from "framer-motion";
import { publications } from "../data/publications";

const PublicationsSection: React.FC = () => {
  const byYear = publications.reduce<Record<number, typeof publications>>(
    (acc, pub) => {
      acc[pub.year] = acc[pub.year] || [];
      acc[pub.year].push(pub);
      return acc;
    },
    {}
  );

  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
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
    <section id="publications" className="space-y-4 mt-4">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Works</h2>
        <p className="text-sm text-accent-primary">
          Recent works.
        </p>
      </header>

      <motion.div
        className="space-y-8 pb-4"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={containerVariants}
      >
        {years.map((year) => (
          <div key={year} className="space-y-3">
            <h3 className="text-sm font-semibold text-accent-light">{year}</h3>
            <ul className="space-y-3">
              {byYear[year].map((pub, idx) => (
                <motion.li
                  key={idx}
                  className={`text-sm border rounded-lg px-4 py-3 transition-colors ${
                    pub.highlight
                      ? "border-accent-secondary bg-bg-surface/30"
                      : "border-bg-surface bg-transparent hover:bg-bg-surface/10"
                  }`}
                  variants={itemVariants}
                >
                  <p className="font-medium text-text-base">{pub.title}</p>
                  <p className="mt-1 text-xs text-accent-primary">
                    {pub.authors}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs text-text-muted">{pub.venue}</p>
                    <span className="inline-block px-2 py-0.5 text-xs rounded bg-bg-surface text-accent-light">
                      {pub.type}
                    </span>
                  </div>
                  {pub.links && (
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {pub.links.pdf && (
                        <a
                          href={pub.links.pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 text-accent-light hover:text-text-base transition-colors"
                        >
                          PDF
                        </a>
                      )}
                      {pub.links.arxiv && (
                        <a
                          href={pub.links.arxiv}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 text-accent-light hover:text-text-base transition-colors"
                        >
                          arXiv
                        </a>
                      )}
                      {pub.links.code && (
                        <a
                          href={pub.links.code}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 text-accent-light hover:text-text-base transition-colors"
                        >
                          Code
                        </a>
                      )}
                    </div>
                  )}
                </motion.li>
              ))}
            </ul>
          </div>
        ))}
      </motion.div>
    </section>
  );
};

export default PublicationsSection;
