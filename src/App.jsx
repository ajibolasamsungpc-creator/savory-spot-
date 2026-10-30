
import { useEffect, useState } from "react";
import "./App.css";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import OrderTracking from "./OrderTracking";
import { useMenu } from "./menu";
import { supabase } from "./supabase";

const money = (amount) =>
  `₦${Number(amount).toLocaleString("en-NG")}`;

function PaymentCallback() {
  const [message, setMessage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("orderId") && params.get("transaction_id")
      ? "Verifying your payment..."
      : "We could not verify this payment. If you were charged, please contact the restaurant with your payment reference.";
  });

  const [orderId] = useState(
    () => new URLSearchParams(window.location.search).get("orderId") || ""
  );

  const [isPaid, setIsPaid] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);

  useEffect(() => {
    if (!isPaid) return undefined;

    const redirectTimeout = window.setTimeout(() => {
      window.location.replace("/");
    }, 3000);

    return () => window.clearTimeout(redirectTimeout);
  }, [isPaid]);

  useEffect(() => {
    let active = true;

    const params = new URLSearchParams(window.location.search);
    const currentOrderId = params.get("orderId") || "";
    const transactionId = params.get("transaction_id");

    async function verifyPayment() {
      if (!currentOrderId || !transactionId) return;

      try {
        const { data, error } = await supabase.functions.invoke(
          "verify-payment",
          {
            body: {
              orderId: currentOrderId,
              transactionId,
            },
          }
        );

        if (error) throw error;

        if (!data?.success) {
          throw new Error(
            data?.message || "Payment could not be verified."
          );
        }

        if (!active) return;

        setIsPaid(true);
        setMessage("Payment Confirmed");
      } catch (error) {
        console.error("Payment verification error:", error);

        if (!active) return;

        setMessage(
          error instanceof Error
            ? error.message
            : "Payment verification failed. Please try again or contact the restaurant."
        );
      }
    }

    verifyPayment();

    return () => {
      active = false;
    };
  }, [verificationAttempt]);

  return (
    <main className="payment-result-page">
      <section className="payment-result-card">
        <span className="eyebrow">PAYMENT UPDATE</span>

        <h1>
          {isPaid ? "Payment Confirmed" : "Checking your payment"}
        </h1>

        <p role="status">{message}</p>

        {isPaid && (
          <div className="payment-result-actions">
            <a className="primary-button" href="/">
              Return to home
            </a>
            {orderId && (
              <a
                className="payment-result-link"
                href={`/track?orderId=${encodeURIComponent(orderId)}`}
              >
                Track your order
              </a>
            )}
          </div>
        )}

        {!isPaid && (
          <div className="payment-result-actions">
            {orderId &&
              new URLSearchParams(window.location.search).has(
                "transaction_id"
              ) && (
                <button
                  type="button"
                  className="payment-result-retry"
                  onClick={() => {
                    setMessage("Retrying payment verification...");
                    setVerificationAttempt((attempt) => attempt + 1);
                  }}
                >
                  Try verification again
                </button>
              )}

            <a className="payment-result-link" href="/">
              Return to the menu
            </a>
          </div>
        )}
      </section>
    </main>
  );
}

function Storefront() {
  const { menu: foods, menuError } = useMenu();

  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState("All");
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const categories = [
    "All",
    ...new Set(foods.map((food) => food.category)),
  ];

  const visibleFoods =
    category === "All"
      ? foods
      : foods.filter((food) => food.category === category);

  const cartCount = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  function addToCart(food) {
    setOrderMessage("");

    setCart((current) => {
      const existing = current.find(
        (item) => item.id === food.id
      );

      if (existing) {
        return current.map((item) =>
          item.id === food.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...food, quantity: 1 }];
    });
  }

  function changeQuantity(id, amount) {
    setOrderMessage("");

    setCart((current) =>
      current
        .map((item) =>
          item.id === id
            ? { ...item, quantity: item.quantity + amount }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function handleCustomerChange(event) {
    const { name, value } = event.target;

    setCustomer((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleCheckout(event) {
    event.preventDefault();

    if (isProcessingPayment) return;

    setOrderMessage("");

    if (cart.length === 0) {
      setOrderMessage("Please add a meal to your cart first.");
      return;
    }

    if (
      !customer.name.trim() ||
      !customer.email.trim() ||
      !customer.phone.trim() ||
      !customer.address.trim()
    ) {
      setOrderMessage("Please complete all your delivery details.");
      return;
    }

    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      setOrderMessage("Your order total is invalid.");
      return;
    }

    try {
      setIsProcessingPayment(true);
      setOrderMessage("Connecting to Flutterwave...");

      const { data, error } = await supabase.functions.invoke(
        "flutterwave-payment",
        {
          body: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            phone: customer.phone.trim(),
            address: customer.address.trim(),

            // Generate a unique order ID.
            orderId: crypto.randomUUID(),

            // Send only menu IDs and quantities.
            // The backend retrieves real prices from Supabase.
            items: cart.map((item) => ({
              id: item.id,
              quantity: item.quantity,
            })),

            redirectUrl: `${window.location.origin}/payment/callback`,
          },
        }
      );

      if (error) {
        console.error("Supabase payment function error:", error);

        if (error.context instanceof Response) {
          const responseData = await error.context.clone().json().catch(() => null);
          if (typeof responseData?.message === "string") {
            throw new Error(responseData.message);
          }
        }

        throw new Error(
          error.message ||
            "Could not connect to the payment service. Please try again."
        );
      }

      if (!data?.success || !data?.paymentUrl) {
        throw new Error(
          data?.message ||
            "Flutterwave could not initialize your payment."
        );
      }

      if (
        typeof data.paymentUrl !== "string" ||
        !data.paymentUrl.startsWith("https://")
      ) {
        throw new Error(
          "The payment service returned an invalid payment link."
        );
      }

      window.location.assign(data.paymentUrl);
    } catch (error) {
      console.error("Checkout error:", error);

      setOrderMessage(
        error.message || "Something went wrong. Please try again."
      );

      setIsProcessingPayment(false);
    }
  }

  return (
    <div className="app" id="home">
      <header className="navbar">
        <a href="#home" className="brand">
          <span className="brand-icon">S</span>
          Savory<span>Spot</span>
        </a>

        <nav>
          <a href="#home">Home</a>
          <a href="#menu">Our Menu</a>
          <a href="#about">About</a>
          <a href="/track">Track Order</a>
        </nav>

        <a href="#cart" className="cart-button">
          🛒 Cart <span>{cartCount}</span>
        </a>
      </header>

      <main>
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">GOOD FOOD, GOOD MOOD</span>

            <h1>
              Delicious food,
              <br />
              <span>delivered with love.</span>
            </h1>

            <p>
              Discover your next favorite meal, freshly
              prepared and delivered straight to your door.
            </p>

            <a href="#menu" className="primary-button">
              Explore Our Menu ↗
            </a>

            <div className="hero-note">
              🍽️ Freshly prepared · Made with care
            </div>
          </div>

          <div className="hero-image">
            {foods[0] && (
              <img src={foods[0].image} alt="Delicious food" />
            )}

            <div className="floating-card">
              <span>⭐</span>
              <div>
                <strong>Made fresh daily</strong>
                <small>Your next favorite meal awaits</small>
              </div>
            </div>
          </div>
        </section>

        <section className="menu-section" id="menu">
          <div className="section-heading">
            <span className="eyebrow">MADE FOR YOUR CRAVINGS</span>
            <h2>Explore our menu</h2>
            <p>Good food is always a good idea.</p>
          </div>

          {menuError && (
            <p className="menu-storage-error" role="status">
              {menuError}
            </p>
          )}

          <div className="category-list">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? "category active" : "category"}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="food-grid">
            {visibleFoods.map((food) => (
              <article className="food-card" key={food.id}>
                <div className="food-image">
                  <img src={food.image} alt={food.name} />
                  <span className="food-category">{food.category}</span>
                </div>

                <div className="food-info">
                  <h3>{food.name}</h3>
                  <p>{food.description}</p>

                  <div className="food-bottom">
                    <strong>{money(food.price)}</strong>

                    <button
                      type="button"
                      className="add-button"
                      onClick={() => addToCart(food)}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {visibleFoods.length === 0 && !menuError && (
            <p className="empty-cart">
              No meals found in this category yet.
            </p>
          )}
        </section>

        <section className="cart-section" id="cart">
          <span className="eyebrow">YOUR SELECTION</span>
          <h2>Your shopping cart</h2>

          {cart.length === 0 ? (
            <p className="empty-cart">
              Your cart is empty. Add something delicious from our menu!
            </p>
          ) : (
            <>
              <div className="cart-items">
                {cart.map((item) => (
                  <div className="cart-item" key={item.id}>
                    <div className="cart-product">
                      <strong>{item.name}</strong>
                      <small>{money(item.price)} each</small>
                    </div>

                    <div className="quantity-controls">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} quantity`}
                        onClick={() => changeQuantity(item.id, -1)}
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        aria-label={`Increase ${item.name} quantity`}
                        onClick={() => changeQuantity(item.id, 1)}
                      >
                        +
                      </button>
                    </div>

                    <strong>
                      {money(Number(item.price) * item.quantity)}
                    </strong>

                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => {
                        setOrderMessage("");
                        setCart((current) =>
                          current.filter((food) => food.id !== item.id)
                        );
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="cart-total">
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>

              <p className="checkout-note">
                Delivery fees, if applicable, will be added later.
              </p>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setShowCheckout(true);
                  setOrderMessage("");

                  setTimeout(() => {
                    document.getElementById("checkout")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }, 0);
                }}
              >
                Proceed to Checkout →
              </button>
            </>
          )}
        </section>

        {showCheckout && (
          <section className="checkout-section" id="checkout">
            <span className="eyebrow">ALMOST THERE</span>
            <h2>Delivery details</h2>
            <p>Tell us where to deliver your delicious meal.</p>

            <form className="checkout-form" onSubmit={handleCheckout}>
              <label htmlFor="customer-name">Full name</label>
              <input
                id="customer-name"
                name="name"
                value={customer.name}
                onChange={handleCustomerChange}
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />

              <label htmlFor="customer-email">Email address</label>
              <input
                id="customer-email"
                name="email"
                type="email"
                value={customer.email}
                onChange={handleCustomerChange}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />

              <label htmlFor="customer-phone">Phone number</label>
              <input
                id="customer-phone"
                name="phone"
                type="tel"
                value={customer.phone}
                onChange={handleCustomerChange}
                placeholder="Enter your phone number"
                autoComplete="tel"
                required
              />

              <label htmlFor="customer-address">Delivery address</label>
              <textarea
                id="customer-address"
                name="address"
                value={customer.address}
                onChange={handleCustomerChange}
                placeholder="Enter your full delivery address"
                autoComplete="street-address"
                rows="3"
                required
              />

              <div className="checkout-summary">
                <span>Order subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={isProcessingPayment}
              >
                {isProcessingPayment
                  ? "Connecting to Flutterwave..."
                  : "Continue to Payment →"}
              </button>

              {orderMessage && (
                <p className="order-message" role="status">
                  {orderMessage}
                </p>
              )}
            </form>
          </section>
        )}

        <section className="about-section" id="about">
          <h2>Good food brings us together.</h2>
          <p>
            At Savory Spot, every meal is an opportunity to make your day
            a little more delicious.
          </p>
        </section>
      </main>

      <footer>
        <a href="#home" className="brand">
          <span className="brand-icon">S</span>
          Savory<span>Spot</span>
        </a>

        <p>
          © {new Date().getFullYear()} Savory Spot. Made with love.
        </p>

        <a href="/admin" className="admin-footer-link">
          Admin Login
        </a>

        <a href="/track" className="admin-footer-link">
          Track Order
        </a>
      </footer>
    </div>
  );
}

function App() {
  const path = window.location.pathname;

  if (path === "/payment/callback") {
    return <PaymentCallback />;
  }

  if (path === "/track" || path === "/track/") {
    return <OrderTracking />;
  }

  if (path === "/admin" || path === "/admin/") {
    return <AdminLogin />;
  }

  if (path === "/admin/dashboard") {
    return <AdminDashboard />;
  }

  if (path === "/admin/dashboard/menu/add") {
    return <AdminDashboard view="add-menu-item" />;
  }

  return <Storefront />;
}

export default App;
