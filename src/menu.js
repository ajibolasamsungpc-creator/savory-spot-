import { useEffect, useState } from "react";
import { supabase } from "./supabase";

function formatMenuItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category || "Other",
    price: Number(item.price),
    image: item.image_url || "",
    description: item.description || "",
  };
}

export function useMenu() {
  const [menu, setMenu] = useState([]);
  const [menuError, setMenuError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchMenu() {
      try {
        const { data, error } = await supabase
          .from("menu_items")
          .select("id, name, description, price, image_url, category")
          .eq("available", true)
          .order("created_at", { ascending: true });

        if (error) throw error;

        if (active) {
          setMenu((data || []).map(formatMenuItem));
          setMenuError("");
        }
      } catch (error) {
        console.error("Menu loading error:", error);

        if (active) {
          setMenuError(
            error instanceof Error
              ? error.message
              : "Unable to load the restaurant menu."
          );
        }
      }
    }

    fetchMenu();

    return () => {
      active = false;
    };
  }, []);

  return { menu, menuError, setMenuError, setMenu };
}
