import React from "react";
import { motion } from "framer-motion";
import { profile } from "../data/profile";
import Mascot from "./Mascot";

const Hero: React.FC = () => {
  return (
    <div className="flex flex-col w-full h-full lg:gap-6">
      {/* Mascot - Fixed */}
      <div className="w-full aspect-square max-w-xs mx-auto lg:mx-0 flex-shrink-0">
        <Mascot className="w-full h-full" />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pr-4 pb-4 lg:pr-2 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6 w-full min-w-0"
        >
          {/* Name & role */}
          <header>
            <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
              {profile.name}
            </h1>
            <p className="mt-2 text-lg text-accent-light">{profile.role}</p>
            <p className="mt-3 text-sm text-accent-primary break-words">
              {profile.tagline}
            </p>
          </header>

          {/* Contact */}
          <section className="space-y-2 text-sm">
            <p className="text-accent-light">{profile.location}</p>
            <a
              href={`mailto:${profile.email}`}
              className="inline-block underline underline-offset-4 decoration-accent-primary hover:decoration-accent-light transition-colors"
            >
              {profile.email}
            </a>

            <div className="flex flex-wrap gap-3 mt-4">
              <a
                href={profile.links.scholar}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs uppercase tracking-wide border border-text-muted px-3 py-1 rounded-full hover:border-accent-light transition-colors"
              >
                Scholar
              </a>
              <a
                href={profile.links.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs uppercase tracking-wide border border-text-muted px-3 py-1 rounded-full hover:border-accent-light transition-colors"
              >
                GitHub
              </a>
              <a
                href={profile.links.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs uppercase tracking-wide border border-text-muted px-3 py-1 rounded-full hover:border-accent-light transition-colors"
              >
                LinkedIn
              </a>
            </div>
          </section>

          {/* About */}
          <section className="text-sm text-text-base leading-relaxed max-w-md">
            <p>{profile.about}</p>
          </section>

          {/* Alma Mater */}
          <section className="space-y-2 text-sm">
            <h3 className="text-accent-primary font-semibold">Alma Mater</h3>
            <ul className="space-y-1 text-text-base">
              <li><em>National and Kapodistrian University of Athens</em></li>
              <li><em>KU Leuven</em></li>
            </ul>
          </section>
        </motion.div>
      </div>
    </div>
  );
};

export default Hero;
