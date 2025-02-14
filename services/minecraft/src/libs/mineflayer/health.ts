export class Health {
  public value: number
  public lastDamageTime?: number
  public lastDamageTaken?: number

  constructor() {
    this.value = 20
  }
}
