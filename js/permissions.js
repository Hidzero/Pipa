export function getAccessLevel(profile) {
  if (profile?.nivel_acesso) {
    return profile.nivel_acesso;
  }

  return profile?.funcao === "administrador" ? "administrador" : "funcionario";
}

export function getOperationalRole(profile) {
  return profile?.funcao || "atendente";
}

export function isAdmin(profile) {
  return getAccessLevel(profile) === "administrador";
}

export function isSupervisor(profile) {
  return getAccessLevel(profile) === "supervisor";
}

export function isEmployee(profile) {
  return getAccessLevel(profile) === "funcionario";
}

export function isDriver(profile) {
  return getOperationalRole(profile) === "motorista";
}

export function isDriverEmployee(profile) {
  return isEmployee(profile) && isDriver(profile);
}

export function isFinance(profile) {
  return getOperationalRole(profile) === "financeiro";
}

export function canManageOperations(profile) {
  return isAdmin(profile) || isSupervisor(profile);
}

export function canManageCompany(profile) {
  return isAdmin(profile);
}

export function canManageTruckAssignments(profile) {
  return isAdmin(profile) || isSupervisor(profile);
}

export function canViewFinance(profile) {
  return isAdmin(profile) || isFinance(profile);
}

export function canAccessRouteByProfile(route, profile) {
  if (!profile) {
    return false;
  }

  if (isAdmin(profile)) {
    return true;
  }

  if (isSupervisor(profile)) {
    return ["/dashboard", "/clientes", "/caminhoes", "/pedidos", "/agenda", "/rota"].includes(route);
  }

  if (isFinance(profile)) {
    return ["/dashboard", "/financeiro", "/relatorios"].includes(route);
  }

  if (isDriverEmployee(profile)) {
    return ["/dashboard", "/rota"].includes(route);
  }

  return ["/dashboard"].includes(route);
}

export function formatAccessLevel(profile) {
  const labels = {
    administrador: "Administrador da empresa",
    supervisor: "Supervisor",
    funcionario: "Funcionario"
  };

  return labels[getAccessLevel(profile)] || "Funcionario";
}

export function formatOperationalRole(profile) {
  const labels = {
    administrador: "Administrador",
    atendente: "Atendente",
    motorista: "Motorista",
    financeiro: "Financeiro"
  };

  return profile?.cargo || labels[getOperationalRole(profile)] || "Funcionario";
}
