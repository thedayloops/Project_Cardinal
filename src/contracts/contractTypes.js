export const ContractKinds = Object.freeze({
  PATROL: "PATROL",
  HUNT: "HUNT",
  ESCORT: "ESCORT"
});

export function makeContractRef(contract) {
  return {
    id: contract.id,
    kind: contract.kind,
    leaderId: contract.leaderId,
    memberIds: contract.memberIds
  };
}
