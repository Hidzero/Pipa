export const PAGE_SIZE = 10;

export function normalizePage(page, total, pageSize = PAGE_SIZE) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, Number(page) || 1), maxPage);
}

export function getPageItems(items, page, pageSize = PAGE_SIZE) {
  const currentPage = normalizePage(page, items.length, pageSize);
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function renderPagination(total, currentPage, pageSize = PAGE_SIZE) {
  const page = normalizePage(currentPage, total, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) {
    return "";
  }

  return `
    <div class="pagination">
      <button class="ghost-button compact-button" type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>Anterior</button>
      <span>Pagina ${page} de ${totalPages}</span>
      <button class="ghost-button compact-button" type="button" data-page="${page + 1}" ${page === totalPages ? "disabled" : ""}>Proxima</button>
    </div>
  `;
}

export function bindPagination(container, onPageChange) {
  container.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      onPageChange(Number(button.dataset.page));
    });
  });
}
