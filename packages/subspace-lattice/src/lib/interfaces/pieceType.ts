export enum PieceType {
  CommandHub = 'COMMAND_HUB',
  Escort = 'ESCORT',
  Infiltrator = 'INFILTRATOR',
  Beam = 'BEAM',
  /** Diagonal Sensor-Net slider (bishop equivalent). Optional heavy-unit draft. */
  Refractor = 'REFRACTOR',
  /** Omni-directional Sensor-Net slider (queen equivalent). Optional heavy-unit draft. */
  Carrier = 'CARRIER',
}

export const pieceTypeChessSymbolMap: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'k',
  [PieceType.Escort]: 'p',
  [PieceType.Infiltrator]: 'n',
  [PieceType.Beam]: 'r',
  // Bishop/queen art not in packs yet — reuse rook glyph until dedicated SVGs ship.
  [PieceType.Refractor]: 'b',
  [PieceType.Carrier]: 'q',
};