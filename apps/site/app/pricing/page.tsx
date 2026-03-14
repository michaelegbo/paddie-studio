import Link from "next/link";
import { Button } from "@paddie-studio/ui";
import { Footer } from "../../components/Footer";
import { LaunchStudioButton } from "../../components/LaunchStudioButton";
import { Navbar } from "../../components/Navbar";

const plans = [
  {
    name: "Studio Free",
    badge: "Starter",
    price: "$0",
    interval: "/month",
    features: [
      "Single workspace with core flow builder",
      "Webhook, HTTP, condition, loop, output nodes",
      "Basic run history and execution trace",
      "Community support",
    ],
  },
  {
    name: "Studio Pro",
    badge: "Recommended",
    price: "$49",
    interval: "/month",
    recommended: true,
    features: [
      "Unlimited flows and historical snapshots",
      "AI, orchestrator, and memory node access",
      "Advanced mapping + node-level tests",
      "Desktop app support and priority assistance",
    ],
  },
  {
    name: "Studio Enterprise",
    badge: "Scale",
    price: "Custom",
    interval: "",
    features: [
      "Org controls, governance, and SSO",
      "Connector policy and deployment options",
      "Dedicated support and SLA",
      "Migration support for embedded Studio users",
    ],
  },
];

export default function PricingPage() {
  return (
    <main>
      <Navbar />
      <section className="hero">
        <div className="container">
          <div className="section-head fade-up">
            <span className="hero-eyebrow">Pricing</span>
            <h1 className="hero-title" style={{ maxWidth: "15ch" }}>
              Choose The Studio Plan That Matches Your Build Velocity
            </h1>
            <p className="hero-subtitle">
              Start with the free tier, then move to Pro or Enterprise when your team needs advanced orchestration,
              memory operations, and governed deployment.
            </p>
          </div>

          <div className="pricing-grid">
            {plans.map((plan, index) => (
              <article
                key={plan.name}
                className={`pricing-card${plan.recommended ? " recommended" : ""} fade-up delay-${Math.min(index + 1, 3)}`}
              >
                <span className="pricing-badge">{plan.badge}</span>
                <h3 style={{ marginTop: 12, marginBottom: 0 }}>{plan.name}</h3>
                <p className="pricing-price">
                  {plan.price}
                  <span>{plan.interval}</span>
                </p>
                <ul className="feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="cta-band fade-up delay-2">
            <div>
              <h3>Need a guided rollout from RMN embedded Studio to standalone?</h3>
              <p>Use Pro for fast adoption, then move to Enterprise once governance requirements increase.</p>
            </div>
            <div className="hero-cta-row">
              <LaunchStudioButton className="button-lift" />
              <Link href="/download">
                <Button variant="ghost">Download Desktop</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

