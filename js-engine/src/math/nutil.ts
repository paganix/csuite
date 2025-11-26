export function getSignedInt(int: number): number {
  const intMax = Math.pow(2, 31) - 1;

  if(int > intMax)
    return int - intMax * 2 - 2;

  return int;
}
