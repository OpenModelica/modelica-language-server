package MyLibrary "My Modelica Library"
  model M "MWE Modelica Model"
    Real x(start = 1.0, fixed = true);
  equation
    der(x) = -0.5*x;
  end M;
end MyLibrary;
