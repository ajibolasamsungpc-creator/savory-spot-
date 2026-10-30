import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useMenu } from "./menu";
import "./AdminDashboard.css";

const money = (amount) => `₦${amount.toLocaleString("en-NG")}`;

const emptyProduct = {
  name: "",
  category: "",
  price: "",
  image: "",
  description: "",
};

export default function AdminDashboard({ view = "overview" }) {
  const { menu: foods, menuError, setMenuError, setMenu } = useMenu();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [product, setProduct] = useState(emptyProduct);
  const [savingProduct, setSavingProduct] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          setError(sessionError.message);
          setLoading(false);
          return;
        }

        if (!data.session) {
          window.location.replace("/admin");
          return;
        }

        setEmail(data.session.user.email ?? "Administrator");
        setLoading(false);
      } catch (sessionError) {
        if (!active) return;
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "Unable to verify your administrator session."
        );
        setLoading(false);
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading || error || view !== "overview") return undefined;
    let active = true;

    async function loadOrders() {
      setOrdersLoading(true);
      setOrdersError("");
      try {
        const { data, error: requestError } =
          await supabase.functions.invoke("admin-orders", {
            body: { action: "list" },
          });
        if (requestError) throw requestError;
        if (!data?.success || !Array.isArray(data.orders)) {
          throw new Error(data?.message || "Could not load paid orders.");
        }
        if (active) setOrders(data.orders);
      } catch (requestError) {
        console.error("Could not load orders:", requestError);
        if (active) {
          setOrdersError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load paid orders."
          );
        }
      } finally {
        if (active) setOrdersLoading(false);
      }
    }

    loadOrders();
    return () => {
      active = false;
    };
  }, [loading, error, view]);

  async function handleOrderStatusChange(orderId, status) {
    setUpdatingOrderId(orderId);
    setOrdersError("");
    try {
      const { data, error: requestError } =
        await supabase.functions.invoke("admin-orders", {
          body: { action: "update", orderId, status },
        });
      if (requestError) throw requestError;
      if (!data?.success) {
        throw new Error(data?.message || "Could not update order status.");
      }
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: data.order.status } : order
        )
      );
    } catch (requestError) {
      console.error("Could not update order:", requestError);
      setOrdersError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update order status."
      );
    } finally {
      setUpdatingOrderId("");
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError("");

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        setError(signOutError.message);
        setSigningOut(false);
        return;
      }

      window.location.replace("/admin");
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Unable to sign out. Please try again."
      );
      setSigningOut(false);
    }
  }

  function handleProductChange(event) {
    const { name, value } = event.target;
    setProduct((current) => ({ ...current, [name]: value }));
  }

  async function handleAddProduct(event) {
    event.preventDefault();
    setSavingProduct(true);
    setMenuError("");
    setSuccessMessage("");

    const trimmedName = product.name.trim();
    const trimmedCategory = product.category.trim();
    const price = Number(product.price);

    if (!trimmedName || !trimmedCategory || !Number.isFinite(price) || price <= 0) {
      setMenuError("Enter a product name, category, and price greater than zero.");
      setSavingProduct(false);
      return;
    }

    try {
      const { data, error: requestError } =
        await supabase.functions.invoke("admin-orders", {
          body: {
            action: "add-menu-item",
            name: trimmedName,
            category: trimmedCategory,
            price,
            image: product.image.trim() || foods[0]?.image || "",
            description: product.description.trim(),
          },
        });

      if (requestError) throw requestError;
      if (!data?.success || !data.menuItem) {
        throw new Error(data?.message || "Could not add the menu item.");
      }

      const newProduct = {
        id: data.menuItem.id,
        name: data.menuItem.name,
        category: data.menuItem.category,
        price: Number(data.menuItem.price),
        image: data.menuItem.image_url || "",
        description: data.menuItem.description || "",
      };

      setMenu((current) => [...current, newProduct]);
      setProduct(emptyProduct);
      setSuccessMessage(`${newProduct.name} was added to the menu.`);
    } catch (saveError) {
      setMenuError(
        saveError instanceof Error
          ? `Could not save the menu: ${saveError.message}`
          : "Could not save the menu. Please try again."
      );
    } finally {
      setSavingProduct(false);
    }
  }

  if (loading) {
    return (
      <main className="admin-dashboard-loading" aria-live="polite">
        Checking administrator session...
      </main>
    );
  }

  return (
    <main className="admin-dashboard">
      <header className="admin-dashboard-header">
        <a className="admin-dashboard-brand" href="/">
          <span className="admin-dashboard-logo">S</span>
          Savory<span>Spot</span>
          <small>ADMIN</small>
        </a>
        <div className="admin-dashboard-account">
          <span>{email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <section className="admin-dashboard-content">
        {view === "add-menu-item" ? (
          <>
            <a className="admin-dashboard-back-link" href="/admin/dashboard">
              ← Back to dashboard
            </a>
            <p className="admin-dashboard-eyebrow">STOREFRONT MENU</p>
            <h1>Add a menu item</h1>
            <p className="admin-dashboard-intro">
              Add a product to your menu. It will be available on the storefront.
            </p>

            {(error || menuError) && (
              <p className="admin-dashboard-error" role="alert">
                {menuError || error}
              </p>
            )}
            {successMessage && (
              <p className="admin-dashboard-success" role="status">
                {successMessage}
              </p>
            )}

            <form
              className="admin-dashboard-product-form"
              onSubmit={handleAddProduct}
            >
              <label htmlFor="product-name">Product name</label>
              <input
                id="product-name"
                name="name"
                value={product.name}
                onChange={handleProductChange}
                placeholder="e.g. Spicy Suya Bowl"
                maxLength={80}
                required
              />

              <label htmlFor="product-category">Category</label>
              <input
                id="product-category"
                name="category"
                value={product.category}
                onChange={handleProductChange}
                placeholder="e.g. Grills"
                maxLength={40}
                list="menu-categories"
                required
              />
              <datalist id="menu-categories">
                {[...new Set(foods.map((food) => food.category))].map(
                  (category) => (
                    <option key={category} value={category} />
                  )
                )}
              </datalist>

              <label htmlFor="product-price">Price (₦)</label>
              <input
                id="product-price"
                name="price"
                type="number"
                min="1"
                step="1"
                value={product.price}
                onChange={handleProductChange}
                placeholder="e.g. 4500"
                required
              />

              <label htmlFor="product-image">Image URL</label>
              <input
                id="product-image"
                name="image"
                type="url"
                value={product.image}
                onChange={handleProductChange}
                placeholder="https://example.com/meal.jpg"
              />
              <small className="admin-dashboard-form-hint">
                Optional. If left blank, the first menu item's image will be used.
              </small>

              <label htmlFor="product-description">Description</label>
              <textarea
                id="product-description"
                name="description"
                value={product.description}
                onChange={handleProductChange}
                placeholder="Describe the meal for your customers"
                maxLength={240}
                rows={4}
              />

              <div className="admin-dashboard-form-actions">
                <a href="/admin/dashboard">Cancel</a>
                <button type="submit" disabled={savingProduct}>
                  {savingProduct ? "Adding item..." : "Add menu item"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="admin-dashboard-eyebrow">OVERVIEW</p>
            <h1>Welcome back</h1>
            <p className="admin-dashboard-intro">
              Here is what is currently set up for your restaurant.
            </p>

            {(error || menuError) && (
              <p className="admin-dashboard-error" role="alert">
                {menuError || error}
              </p>
            )}

            <div className="admin-dashboard-stats">
              <article className="admin-dashboard-stat">
                <span>Menu items</span>
                <strong>{foods.length}</strong>
                <small>Available on the storefront</small>
              </article>
              <article className="admin-dashboard-stat">
                <span>Menu categories</span>
                <strong>{new Set(foods.map((food) => food.category)).size}</strong>
                <small>Across your current menu</small>
              </article>
              <article className="admin-dashboard-stat">
                <span>Order management</span>
                <strong className="admin-dashboard-stat-status">
                  {ordersLoading ? "Loading..." : orders.length}
                </strong>
                <small>Paid orders ready for fulfilment</small>
              </article>
            </div>

            <section className="admin-dashboard-orders">
              <div className="admin-dashboard-menu-heading">
                <div>
                  <p className="admin-dashboard-eyebrow">FULFILMENT</p>
                  <h2>Paid orders</h2>
                </div>
                <button
                  type="button"
                  className="admin-dashboard-refresh"
                  onClick={() => window.location.reload()}
                  disabled={ordersLoading}
                >
                  Refresh
                </button>
              </div>

              {ordersError && (
                <p className="admin-dashboard-error" role="alert">
                  {ordersError}
                </p>
              )}
              {ordersLoading ? (
                <p className="admin-dashboard-orders-empty">Loading paid orders...</p>
              ) : orders.length === 0 ? (
                <p className="admin-dashboard-orders-empty">
                  No paid orders yet.
                </p>
              ) : (
                <div className="admin-dashboard-order-list">
                  {orders.map((order) => (
                    <article
                      className="admin-dashboard-order"
                      key={order.id}
                    >
                      <div className="admin-dashboard-order-heading">
                        <div>
                          <strong>{order.customer_name}</strong>
                          <span>{order.customer_email} · {order.customer_phone}</span>
                          <small>Reference: {order.id}</small>
                        </div>
                        <strong>{money(Number(order.subtotal))}</strong>
                      </div>
                      <p className="admin-dashboard-order-address">
                        {order.delivery_address}
                      </p>
                      <p className="admin-dashboard-order-items">
                        {order.items.map(
                          (item) => `${item.name} × ${item.quantity}`
                        ).join(", ")}
                      </p>
                      <div className="admin-dashboard-order-status">
                        <label htmlFor={`order-status-${order.id}`}>
                          Delivery status
                        </label>
                        <select
                          id={`order-status-${order.id}`}
                          value={order.status}
                          onChange={(event) =>
                            handleOrderStatusChange(order.id, event.target.value)
                          }
                          disabled={updatingOrderId === order.id}
                        >
                          <option value="confirmed">Order confirmed</option>
                          <option value="preparing">Preparing your meal</option>
                          <option value="out_for_delivery">Out for delivery</option>
                          <option value="delivered">Delivered</option>
                        </select>
                        {updatingOrderId === order.id && (
                          <small>Saving...</small>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="admin-dashboard-menu">
              <div className="admin-dashboard-menu-heading">
                <div>
                  <p className="admin-dashboard-eyebrow">STOREFRONT MENU</p>
                  <h2>Current menu items</h2>
                </div>
                <div className="admin-dashboard-menu-actions">
                  <a className="admin-dashboard-add-link" href="/admin/dashboard/menu/add">
                    + Add menu item
                  </a>
                  <a href="/">View storefront</a>
                </div>
              </div>
              <div className="admin-dashboard-menu-list">
                {foods.map((food) => (
                  <article className="admin-dashboard-menu-item" key={food.id}>
                    <div>
                      <strong>{food.name}</strong>
                      <span>{food.category}</span>
                    </div>
                    <strong>{money(food.price)}</strong>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
