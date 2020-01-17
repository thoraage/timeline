import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

it('renders without crashing', () => {
  const div = document.createElement('div');
  ReactDOM.render(<App />, div);
});

it('parses US date and outputs as locale', () => {
  expect(convertUSDataToLocal("9/25/2019")).toBe("xxx");
});
