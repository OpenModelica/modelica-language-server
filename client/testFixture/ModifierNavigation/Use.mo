within ModifierNavigation;
model Use
  parameter Real Ti = 2;
  parameter Real integralTime = 3;
  Controller PI(Ti=0.1);
end Use;
