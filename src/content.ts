console.log("[Content Script] Active on:", window.location.href);

const tables = document.querySelectorAll("table");
if (tables.length > 0) {
  console.log(`[Content Script] Found ${tables.length} tables on the page.`);
}
