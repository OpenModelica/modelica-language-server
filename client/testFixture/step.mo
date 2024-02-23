class Modelica.Blocks.Sources.Step "Generate step signal of type Real"
  parameter Real height = 1.0 "Height of step";
  output Real y "Connector of Real output signal";
  parameter Real offset = 0.0 "Offset of output signal y";
  parameter Real startTime(quantity = "Time", unit = "s") = 0.0 "Output y = offset for time < startTime";
equation
  y = offset + (if time < startTime then 0.0 else height);
  annotation (
    Documentation(info="<html>
<p>
The Real output y is a step signal:
</p>

<p>
<img src=\"modelica://Modelica/Resources/Images/Blocks/Sources/Step.png\"
   alt=\"Step.png\">
</p>

</html>"));
end Modelica.Blocks.Sources.Step;
