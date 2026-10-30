import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const money = (amount) =>
  `₦${Number(amount).toLocaleString("en-NG")}`;

const orderSteps = [
  { value: "confirmed", label: "Order confirmed" },
  { value: "preparing", label: "Preparing your meal" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
];

export default function OrderTracking() {
  const [orderId, setOrderId] = useState(
    () => new URLSearchParams(window.location.search).get("orderId") || ""
  );
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const currentOrderId = order?.id;

  async function findOrder(event) {
    event?.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error: lookupError } =
        await supabase.functions.invoke("track-order", {
          body: {
            orderId: orderId.trim(),
            email: email.trim(),
          },
        });

      if (lookupError) throw lookupError;
      if (!data?.success || !data?.order) {
        throw new Error(
          data?.message || "We couldn't find an order matching those details."
        );
      }

      setOrder(data.order);
    } catch (lookupError) {
      console.error("Order lookup error:", lookupError);
      setOrder(null);
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Unable to load your order. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!currentOrderId) return undefined;

    const timer = window.setInterval(async () => {
      setRefreshing(true);
      try {
        const { data, error: lookupError } =
          await supabase.functions.invoke("track-order", {
            body: { orderId: currentOrderId, email },
          });
        if (lookupError) throw lookupError;
        if (data?.success && data.order) setOrder(data.order);
      } catch (refreshError) {
        console.error("Order refresh error:", refreshError);
      } finally {
        setRefreshing(false);
      }
    }, 20000);

    return () => window.clearInterval(timer);
  }, [currentOrderId, email]);

  const currentStep = orderSteps.findIndex(
    (step) => step.value === order?.status
  );

  return (
    <main className="tracking-page">
      <a className="tracking-brand" href="/">
        <span className="brand-icon">S</span>
        Savory<span>Spot</span>
      </a>

      <section className="tracking-card">
        <span className="eyebrow">ORDER UPDATES</span>
        <h1>Track your order</h1>
        <p className="tracking-intro">
          Enter your order reference and the email used at checkout to see the
          latest delivery status.
        </p>

        <form className="tracking-form" onSubmit={findOrder}>
          <label htmlFor="tracking-order-id">Order reference</label>
          <input
            id="tracking-order-id"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder="Paste your order reference"
            autoComplete="off"
            required
          />

          <label htmlFor="tracking-email">Checkout email</label>
          <input
            id="tracking-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Finding your order..." : "Track order"}
          </button>
        </form>

        {error && (
          <p className="tracking-error" role="alert">
            {error}
          </p>
        )}

        {order && (
          <section className="tracking-result" aria-live="polite">
            <div className="tracking-order-heading">
              <div>
                <span className="tracking-label">ORDER</span>
                <strong>{order.id}</strong>
              </div>
              <button
                type="button"
                className="tracking-refresh"
                onClick={() => findOrder()}
                disabled={loading || refreshing}
              >
                {refreshing ? "Updating..." : "Refresh"}
              </button>
            </div>

            {order.payment_status !== "paid" ? (
              <p className="tracking-payment-warning" role="status">
                Payment is not confirmed yet. Order tracking will begin once
                your payment has been verified.
              </p>
            ) : (
              <>
                <div className="tracking-current-status">
                  <span className="tracking-label">CURRENT STATUS</span>
                  <strong>
                    {orderSteps.find((step) => step.value === order.status)
                      ?.label || "Order confirmed"}
                  </strong>
                  <small>
                    Updates automatically every 20 seconds
                  </small>
                </div>

                <ol className="tracking-steps">
                  {orderSteps.map((step, index) => {
                    const complete =
                      currentStep >= 0 && index <= currentStep;
                    return (
                      <li
                        key={step.value}
                        className={complete ? "complete" : ""}
                      >
                        <span className="tracking-step-marker">
                          {complete ? "✓" : index + 1}
                        </span>
                        <span>{step.label}</span>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}

            <div className="tracking-order-items">
              <h2>Order summary</h2>
              {order.items.map((item, index) => (
                <div
                  className="tracking-order-item"
                  key={`${item.id}-${index}`}
                >
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <strong>
                    {money(Number(item.price) * Number(item.quantity))}
                  </strong>
                </div>
              ))}
              <div className="tracking-order-total">
                <span>Paid total</span>
                <strong>{money(order.subtotal)}</strong>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
