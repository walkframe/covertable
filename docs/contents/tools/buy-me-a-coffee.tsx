import React, { useEffect } from "react";

export default function BuyMeACoffee() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js";
    script.setAttribute("data-name", "bmc-button");
    script.setAttribute("data-slug", "righ");
    script.setAttribute("data-color", "#5F7FFF");
    script.setAttribute("data-emoji", "");
    script.setAttribute("data-font", "Cookie");
    script.setAttribute("data-text", "Buy me a coffee");
    script.setAttribute("data-outline-color", "#000000");
    script.setAttribute("data-font-color", "#ffffff");
    script.setAttribute("data-coffee-color", "#FFDD00");
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return null;
}
