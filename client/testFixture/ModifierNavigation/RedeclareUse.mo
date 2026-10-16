within ModifierNavigation;
model RedeclareUse
  Wrapper changed(redeclare model C = Base, item(Ti=0.1));
  Wrapper original(item(Ti=0.1));
end RedeclareUse;
