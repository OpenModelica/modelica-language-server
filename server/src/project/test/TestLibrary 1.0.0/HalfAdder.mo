within TestLibrary;

import Modelica.Electrical.Digital.Interfaces.{DigitalInput, DigitalOutput};
import Modelica.Electrical.Digital.Gates.{AndGate, XorGate};

model HalfAdder
  DigitalInput a;
  DigitalInput b;
  DigitalOutput s;
  DigitalOutput c;
protected
  AndGate andGate;
  XorGate xorGate;
equation
  connect(andGate,y, c);
  connect(xorGate.y, s);
  connect(b, andGate.x[1]);
  connect(b, xorGate.x[1]);
  connect(a, xorGate.x[2]);
  connect(a, andGate.x[2]);
end HalfAdder;
