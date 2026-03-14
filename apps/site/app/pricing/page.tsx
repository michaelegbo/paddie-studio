import Link from "next/link";
import { Button } from "@paddie-studio/ui";
import { Footer } from "../../components/Footer";
import { LaunchStudioButton } from "../../components/LaunchStudioButton";
import { Navbar } from "../../components/Navbar";

const plans = [
  {
    name: "Studio Free",
    price: "$0",
    interval: "/month",
    features: [
      "Single workspace",
      "Webhook + HTTP + Output nodes",
      "Basic run history",
      "Community support",
    ],
  },
  {
    name: "Studio Pro",
    price: "$49",
    interval: "/month",
    features: [
      "Unlimited flows",
      "AI + orchestrator + memory nodes",
      "Node-level test runs and advanced mapping",
      "Desktop app access and priority support",
    ],
  },
  {
    name: "Studio Enterprise",
    price: "Custom",
    interval: "",
    features: [
      "Dedicated deployment and SSO",
      "Custom connector policies",
      "Audit exports and governance controls",
      "SLA-backed support",
    ],
  },
];

export default function PricingPage() {
  return (
    <main>
      <Navbar />
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Simple Pricing For Teams Shipping Flows</h2>
            <p>Start free, upgrade as orchestration volume and team size grow.</p>
          </div>
          <div className="feature-grid">
            {plans.map((plan) => (
              <article key={plan.name} className="card">
                <strong>{plan.name}</strong>
                <p style={{ fontSize: 30, margin: "14px 0 2px", color: "#F8FAFC" }}>
                  {plan.price}
                  <span style={{ fontSize: 16, color: "#9B9DB3" }}>{plan.interval}</span>
                </p>
                <ul className="list-clean">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="hero-actions" style={{ marginTop: 26 }}>
            <LaunchStudioButton />
            <Link href="/download">
              <Button variant="ghost">Download Desktop</Button>
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
