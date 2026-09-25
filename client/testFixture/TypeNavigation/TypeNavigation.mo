package TypeNavigation
  model FirstOrder
    Real x;
  end FirstOrder;
  model SecondOrder
    Real x;
  end SecondOrder;
  model Example
    FirstOrder filter;
  equation
    filter.x = 1;
  end Example;
end TypeNavigation;
