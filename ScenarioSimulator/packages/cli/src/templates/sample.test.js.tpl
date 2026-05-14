describe('__NAME__ — пример теста', () => {
  beforeEach(({ hub }) => {
    hub.addRoom({ name: 'Тест' });
    hub.addAccessory({
      id: 100,
      name: 'Тестовая лампа',
      room: 'Тест',
      services: [{
        type: HS.Lightbulb,
        characteristics: [
          { type: HC.On, value: false },
        ],
      }],
    });
  });

  it('лампочка стартует выключенной', ({ hub }) => {
    expect(hub.acc(100).char(HS.Lightbulb, HC.On).getValue()).toBe(false);
  });

  it('включается через Hub.setCharacteristicValue', ({ hub }) => {
    const on = hub.acc(100).char(HS.Lightbulb, HC.On);
    on.setValue(true);
    expect(on.getValue()).toBe(true);
  });
});
