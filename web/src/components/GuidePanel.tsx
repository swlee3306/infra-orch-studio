import React from 'react'
import { RouteGuideKey, useI18n } from '../i18n'

export default function GuidePanel({ routeKey }: { routeKey: RouteGuideKey }) {
  const { copy } = useI18n()
  const pageGuide = copy.guide.pages[routeKey]

  return (
    <section className="guide-grid">
      <article className="guide-card">
        <div className="section-kicker">{copy.guide.title}</div>
        <h3>{copy.guide.cycleTitle}</h3>
        <ol className="guide-list">
          {copy.guide.cycleSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </article>
      <article className="guide-card">
        <div className="section-kicker">{copy.guide.title}</div>
        <h3>{copy.guide.pageTitle}</h3>
        <p className="guide-summary">{pageGuide.summary}</p>
        <ul className="guide-bullets">
          {pageGuide.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
    </section>
  )
}
