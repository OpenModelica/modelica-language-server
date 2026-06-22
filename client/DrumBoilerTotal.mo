package ModelicaServices "ModelicaServices (OpenModelica implementation) - Models and functions used in the Modelica Standard Library requiring a tool specific implementation"
  extends Modelica.Icons.Package;

  package Machine "Machine dependent constants"
    extends Modelica.Icons.Package;
    final constant Real eps = 2.2204460492503131e-016 "The difference between 1 and the least value greater than 1 that is representable in the given floating point type";
    final constant Real small = 2.2250738585072014e-308 "Minimum normalized positive floating-point number";
    final constant Real inf = 1e60 "Maximum representable finite floating-point number";
    final constant Integer Integer_inf = OpenModelica.Internal.Architecture.integerMax() "Biggest Integer number such that Integer_inf and -Integer_inf are representable on the machine";
  end Machine;
  annotation(version = "4.1.0", versionDate = "2025-05-23", dateModified = "2025-05-23 15:00:00Z");
end ModelicaServices;

package Modelica "Modelica Standard Library"
  extends Modelica.Icons.Package;

  package Blocks "Library of basic input/output control blocks (continuous, discrete, logical, table blocks)"
    extends Modelica.Icons.Package;
    import Modelica.Units.SI;

    package Continuous "Library of continuous control blocks with internal states"
      import Modelica.Blocks.Interfaces;
      extends Modelica.Icons.Package;

      block PI "Proportional-Integral controller"
        import Modelica.Blocks.Types.Init;
        parameter Real k = 1 "Gain";
        parameter SI.Time T(start = 1, min = Modelica.Constants.small) "Time Constant (T>0 required)";
        parameter Init initType = Init.NoInit "Type of initialization (1: no init, 2: steady state, 3: initial state, 4: initial output)" annotation(Evaluate = true);
        parameter Real x_start = 0 "Initial or guess value of state";
        parameter Real y_start = 0 "Initial value of output";
        extends Interfaces.SISO;
        output Real x(start = x_start) "State of block";
      initial equation
        if initType == Init.SteadyState then
          der(x) = 0;
        elseif initType == Init.InitialState then
          x = x_start;
        elseif initType == Init.InitialOutput then
          y = y_start;
        end if;
      equation
        der(x) = u/T;
        y = k*(x + u);
      end PI;
    end Continuous;

    package Interfaces "Library of connectors and partial models for input/output blocks"
      extends Modelica.Icons.InterfacesPackage;
      connector RealInput = input Real "'input Real' as connector";
      connector RealOutput = output Real "'output Real' as connector";

      partial block SO "Single Output continuous control block"
        extends Modelica.Blocks.Icons.Block;
        RealOutput y "Connector of Real output signal";
      end SO;

      partial block SISO "Single Input Single Output continuous control block"
        extends Modelica.Blocks.Icons.Block;
        RealInput u "Connector of Real input signal";
        RealOutput y "Connector of Real output signal";
      end SISO;

      partial block SignalSource "Base class for continuous signal source"
        extends SO;
        parameter Real offset = 0 "Offset of output signal y";
        parameter SI.Time startTime = 0 "Output y = offset for time < startTime";
      end SignalSource;
    end Interfaces;

    package Math "Library of Real mathematical functions as input/output blocks"
      import Modelica.Blocks.Interfaces;
      extends Modelica.Icons.Package;

      block Gain "Output the product of a gain value with the input signal"
        parameter Real k(start = 1) "Gain value multiplied with input signal";
        Interfaces.RealInput u "Input signal connector";
        Interfaces.RealOutput y "Output signal connector";
      equation
        y = k*u;
      end Gain;

      block Feedback "Output difference between commanded and feedback input"
        Interfaces.RealInput u1 "Commanded input";
        Interfaces.RealInput u2 "Feedback input";
        Interfaces.RealOutput y;
      equation
        y = u1 - u2;
      end Feedback;
    end Math;

    package Nonlinear "Library of discontinuous or non-differentiable algebraic control blocks"
      import Modelica.Blocks.Interfaces;
      extends Modelica.Icons.Package;

      block Limiter "Limit the range of a signal"
        parameter Real uMax(start = 1) "Upper limits of input signals";
        parameter Real uMin = -uMax "Lower limits of input signals";
        parameter Boolean strict = false "= true, if strict limits with noEvent(..)" annotation(Evaluate = true);
        parameter Types.LimiterHomotopy homotopyType = Modelica.Blocks.Types.LimiterHomotopy.Linear "Simplified model for homotopy-based initialization" annotation(Evaluate = true);
        extends Interfaces.SISO;
      protected
        Real simplifiedExpr "Simplified expression for homotopy-based initialization";
      equation
        assert(uMax >= uMin, "Limiter: Limits must be consistent. However, uMax (=" + String(uMax) + ") < uMin (=" + String(uMin) + ")");
        simplifiedExpr = (if homotopyType == Types.LimiterHomotopy.Linear then u else if homotopyType == Types.LimiterHomotopy.UpperLimit then uMax else if homotopyType == Types.LimiterHomotopy.LowerLimit then uMin else 0);
        if strict then
          if homotopyType == Types.LimiterHomotopy.NoHomotopy then
            y = smooth(0, noEvent(if u > uMax then uMax else if u < uMin then uMin else u));
          else
            y = homotopy(actual = smooth(0, noEvent(if u > uMax then uMax else if u < uMin then uMin else u)), simplified = simplifiedExpr);
          end if;
        else
          if homotopyType == Types.LimiterHomotopy.NoHomotopy then
            y = smooth(0, if u > uMax then uMax else if u < uMin then uMin else u);
          else
            y = homotopy(actual = smooth(0, if u > uMax then uMax else if u < uMin then uMin else u), simplified = simplifiedExpr);
          end if;
        end if;
      end Limiter;
    end Nonlinear;

    package Sources "Library of signal source blocks generating Real, Integer and Boolean signals"
      import Modelica.Blocks.Interfaces;
      extends Modelica.Icons.SourcesPackage;

      block Constant "Generate constant signal of type Real"
        parameter Real k(start = 1) "Constant output value";
        extends Interfaces.SO;
      equation
        y = k;
      end Constant;

      block TimeTable "Generate a (possibly discontinuous) signal by linear interpolation in a table"
        parameter Real table[:, 2] = fill(0.0, 0, 2) "Table matrix (time = first column; e.g., table=[0, 0; 1, 1; 2, 4])";
        parameter SI.Time timeScale(min = Modelica.Constants.eps) = 1 "Time scale of first table column" annotation(Evaluate = true);
        extends Interfaces.SignalSource;
        parameter SI.Time shiftTime = startTime "Shift time of first table column";
      protected
        discrete Real a "Interpolation coefficient a of actual interval (y=a*x+b)";
        discrete Real b "Interpolation coefficient b of actual interval (y=a*x+b)";
        Integer last(start = 1) "Last used lower grid index";
        discrete SI.Time nextEvent(start = 0, fixed = true) "Next event instant";
        discrete Real nextEventScaled(start = 0, fixed = true) "Next scaled event instant";
        Real timeScaled "Scaled time";

        function getInterpolationCoefficients "Determine interpolation coefficients and next time event"
          extends Modelica.Icons.Function;
          input Real table[:, 2] "Table for interpolation";
          input Real offset "y-offset";
          input Real startTimeScaled "Scaled time-offset";
          input Real timeScaled "Actual scaled time instant";
          input Integer last "Last used lower grid index";
          input Real TimeEps "Relative epsilon to check for identical time instants";
          input Real shiftTimeScaled "Time shift";
          output Real a "Interpolation coefficient a (y=a*x + b)";
          output Real b "Interpolation coefficient b (y=a*x + b)";
          output Real nextEventScaled "Next scaled event instant";
          output Integer next "New lower grid index";
        protected
          Integer columns = 2 "Column to be interpolated";
          Integer ncol = 2 "Number of columns to be interpolated";
          Integer nrow = size(table, 1) "Number of table rows";
          Integer next0;
          Real tp;
          Real dt;
        algorithm
          next := last;
          nextEventScaled := timeScaled - TimeEps*abs(timeScaled);
          tp := timeScaled + TimeEps*abs(timeScaled);
          if tp < startTimeScaled then
            nextEventScaled := startTimeScaled;
            a := 0;
            b := offset;
          elseif nrow < 2 then
            a := 0;
            b := offset + table[1, columns];
          else
            tp := tp - shiftTimeScaled;
            while next < nrow and tp >= table[next, 1] loop
              next := next + 1;
            end while;
            if next < nrow then
              nextEventScaled := shiftTimeScaled + table[next, 1];
            else
            end if;
            if next == 1 then
              next := 2;
            else
            end if;
            next0 := next - 1;
            dt := table[next, 1] - table[next0, 1];
            if dt <= TimeEps*abs(table[next, 1]) then
              a := 0;
              b := offset + table[next, columns];
            else
              a := (table[next, columns] - table[next0, columns])/dt;
              b := offset + table[next0, columns] - a*table[next0, 1];
            end if;
          end if;
          b := b - a*shiftTimeScaled;
        end getInterpolationCoefficients;
      equation
        assert(size(table, 1) > 0, "No table values defined.");
        timeScaled = time/timeScale;
        y = a*timeScaled + b;
      algorithm
        if size(table, 1) > 1 then
          assert(not (table[1, 1] > 0.0 or table[1, 1] < 0.0), "The first point in time has to be set to 0, but is table[1,1] = " + String(table[1, 1]));
        else
        end if;
        when {time >= pre(nextEvent), initial()} then
          (a, b, nextEventScaled, last) := getInterpolationCoefficients(table, offset, startTime/timeScale, timeScaled, last, 100*Modelica.Constants.eps, shiftTime/timeScale);
          nextEvent := nextEventScaled*timeScale;
        end when;
      end TimeTable;
    end Sources;

    package Types "Library of constants, external objects and types with choices, especially to build menus"
      extends Modelica.Icons.TypesPackage;
      type Init = enumeration(NoInit "No initialization (start values are used as guess values with fixed=false)", SteadyState "Steady state initialization (derivatives of states are zero)", InitialState "Initialization with initial states", InitialOutput "Initialization with initial outputs (and steady state of the states if possible)") "Enumeration defining initialization of a block" annotation(Evaluate = true);
      type LimiterHomotopy = enumeration(NoHomotopy "Homotopy is not used", Linear "Simplified model without limits", UpperLimit "Simplified model fixed at upper limit", LowerLimit "Simplified model fixed at lower limit") "Enumeration defining use of homotopy in limiter components" annotation(Evaluate = true);
    end Types;

    package Icons "Icons for Blocks"
      extends Modelica.Icons.IconsPackage;

      partial block Block "Basic graphical layout of input/output block" end Block;
    end Icons;
  end Blocks;

  package Fluid "Library of 1-dim. thermo-fluid flow models using the Modelica.Media media description"
    extends Modelica.Icons.Package;
    import Modelica.Units.SI;
    import Cv = Modelica.Units.Conversions;

    package Examples "Demonstration of the usage of the library"
      extends Modelica.Icons.ExamplesPackage;

      package DrumBoiler "Drum boiler example, see Franke, Rode, Krüger: On-line Optimization of Drum Boiler Startup, 3rd International Modelica Conference, Linköping, 2003"
        extends Modelica.Icons.ExamplesPackage;

        model DrumBoiler "Complete drum boiler model, including evaporator and supplementary components"
          extends Modelica.Icons.Example;
          parameter Boolean use_inputs = false "= true, if external inputs are used, otherwise use test data contained internally";
          Modelica.Fluid.Examples.DrumBoiler.BaseClasses.EquilibriumDrumBoiler evaporator(m_D = 300e3, cp_D = 500, V_t = 100, V_l_start = 67, redeclare package Medium = Modelica.Media.Water.StandardWater, energyDynamics = Modelica.Fluid.Types.Dynamics.FixedInitial, massDynamics = Modelica.Fluid.Types.Dynamics.FixedInitial, p_start = 100000);
          Modelica.Thermal.HeatTransfer.Sources.PrescribedHeatFlow furnace;
          Modelica.Fluid.Sources.FixedBoundary sink(nPorts = 1, p = Cv.from_bar(0.5), redeclare package Medium = Modelica.Media.Water.StandardWaterOnePhase, T = 500);
          Modelica.Fluid.Sensors.MassFlowRate massFlowRate(redeclare package Medium = Modelica.Media.Water.StandardWater);
          Modelica.Fluid.Sensors.Temperature temperature(redeclare package Medium = Modelica.Media.Water.StandardWater);
          Modelica.Fluid.Sensors.Pressure pressure(redeclare package Medium = Modelica.Media.Water.StandardWater);
          Modelica.Blocks.Continuous.PI controller(T = 120, k = 10, initType = Modelica.Blocks.Types.Init.InitialState);
          Modelica.Fluid.Sources.MassFlowSource_h pump(nPorts = 1, h = 5e5, redeclare package Medium = Modelica.Media.Water.StandardWater, use_m_flow_in = true);
          Modelica.Blocks.Math.Feedback feedback;
          Modelica.Blocks.Sources.Constant levelSetPoint(k = 67);
          Modelica.Blocks.Interfaces.RealOutput T_S(final unit = "degC") "Steam temperature";
          Modelica.Blocks.Interfaces.RealOutput p_S(final unit = "bar") "Steam pressure";
          Modelica.Blocks.Interfaces.RealOutput qm_S(unit = "kg/s") "Steam flow rate";
          Modelica.Blocks.Interfaces.RealOutput V_l(unit = "m3") "Liquid volume inside drum";
          Modelica.Blocks.Math.Gain MW2W(k = 1e6);
          Modelica.Blocks.Math.Gain Pa2bar(k = 1e-5);
          Modelica.Thermal.HeatTransfer.Celsius.FromKelvin K2degC;
          Modelica.Blocks.Nonlinear.Limiter limiter(uMin = 0, uMax = 500);
          Modelica.Fluid.Valves.ValveLinear SteamValve(redeclare package Medium = Modelica.Media.Water.StandardWater, dp_nominal = 9000000, m_flow_nominal = 180);
          inner Modelica.Fluid.System system;
          Modelica.Blocks.Sources.TimeTable q_F_Tab(table = [0, 0; 3600, 400; 7210, 400]) if not use_inputs;
          Modelica.Blocks.Sources.TimeTable Y_Valve_Tab(table = [0, 0; 900, 1; 7210, 1]) if not use_inputs;
          Blocks.Interfaces.RealInput q_F(unit = "MW") if use_inputs "Fuel flow rate";
          Blocks.Interfaces.RealInput Y_Valve if use_inputs "Valve opening";
        equation
          connect(furnace.port, evaporator.heatPort);
          connect(controller.u, feedback.y);
          connect(massFlowRate.m_flow, qm_S);
          connect(evaporator.V, V_l);
          connect(MW2W.y, furnace.Q_flow);
          connect(pressure.p, Pa2bar.u);
          connect(Pa2bar.y, p_S);
          connect(K2degC.Celsius, T_S);
          connect(controller.y, limiter.u);
          connect(limiter.y, pump.m_flow_in);
          connect(temperature.T, K2degC.Kelvin);
          connect(pressure.port, massFlowRate.port_a);
          connect(pump.ports[1], evaporator.port_a);
          connect(massFlowRate.port_b, SteamValve.port_a);
          connect(SteamValve.port_b, sink.ports[1]);
          connect(evaporator.port_b, massFlowRate.port_a);
          connect(temperature.port, massFlowRate.port_a);
          connect(q_F_Tab.y, MW2W.u);
          connect(Y_Valve_Tab.y, SteamValve.opening);
          connect(q_F, MW2W.u);
          connect(Y_Valve, SteamValve.opening);
          connect(evaporator.V, feedback.u2);
          connect(levelSetPoint.y, feedback.u1);
          annotation(experiment(StopTime = 5400));
        end DrumBoiler;

        package BaseClasses "Additional components for drum boiler example"
          extends Modelica.Icons.BasesPackage;

          model EquilibriumDrumBoiler "Simple Evaporator with two states, see Åström, Bell: Drum-boiler dynamics, Automatica 36, 2000, pp.363-378"
            extends Modelica.Fluid.Interfaces.PartialTwoPort(final port_a_exposesState = true, final port_b_exposesState = true, redeclare replaceable package Medium = Modelica.Media.Water.StandardWater constrainedby Modelica.Media.Interfaces.PartialTwoPhaseMedium);
            import Modelica.Constants;
            import Modelica.Fluid.Types;
            parameter SI.Mass m_D "Mass of surrounding drum metal";
            parameter Medium.SpecificHeatCapacity cp_D "Specific heat capacity of drum metal";
            parameter SI.Volume V_t "Total volume inside drum";
            parameter Medium.AbsolutePressure p_start = system.p_start "Start value of pressure";
            parameter SI.Volume V_l_start = V_t/2 "Start value of liquid volumeStart value of volume";
            parameter Boolean allowFlowReversal = system.allowFlowReversal "= true, if flow reversal is enabled, otherwise restrict flow to design direction (port_a -> port_b)" annotation(Evaluate = true);
            parameter Types.Dynamics energyDynamics = system.energyDynamics "Formulation of energy balance" annotation(Evaluate = true);
            parameter Types.Dynamics massDynamics = system.massDynamics "Formulation of mass balance" annotation(Evaluate = true);
            Modelica.Thermal.HeatTransfer.Interfaces.HeatPort_a heatPort;
            Modelica.Blocks.Interfaces.RealOutput V(unit = "m3") "Liquid volume";
            Medium.SaturationProperties sat "State vector to compute saturation properties";
            Medium.AbsolutePressure p(start = p_start, stateSelect = StateSelect.prefer) "Pressure inside drum boiler";
            Medium.Temperature T "Temperature inside drum boiler";
            SI.Volume V_v "Volume of vapour phase";
            SI.Volume V_l(start = V_l_start, stateSelect = StateSelect.prefer) "Volumes of liquid phase";
            Medium.SpecificEnthalpy h_v = Medium.dewEnthalpy(sat) "Specific enthalpy of vapour";
            Medium.SpecificEnthalpy h_l = Medium.bubbleEnthalpy(sat) "Specific enthalpy of liquid";
            Medium.Density rho_v = Medium.dewDensity(sat) "Density in vapour phase";
            Medium.Density rho_l = Medium.bubbleDensity(sat) "Density in liquid phase";
            SI.Mass m "Total mass of drum boiler";
            SI.Energy U "Internal energy";
            Medium.Temperature T_D = heatPort.T "Temperature of drum";
            SI.HeatFlowRate q_F = heatPort.Q_flow "Heat flow rate from furnace";
            Medium.SpecificEnthalpy h_W = inStream(port_a.h_outflow) "Feed water enthalpy (specific enthalpy close to feedwater port when mass flows in to the boiler)";
            Medium.SpecificEnthalpy h_S = inStream(port_b.h_outflow) "Steam enthalpy (specific enthalpy close to steam port when mass flows in to the boiler)";
            SI.MassFlowRate qm_W = port_a.m_flow "Feed water mass flow rate";
            SI.MassFlowRate qm_S = port_b.m_flow "Steam mass flow rate";
          initial equation
            if energyDynamics == Types.Dynamics.FixedInitial then
              p = p_start;
            elseif energyDynamics == Types.Dynamics.SteadyStateInitial then
              der(p) = 0;
            end if;
            if massDynamics == Types.Dynamics.FixedInitial then
              V_l = V_l_start;
            elseif energyDynamics == Types.Dynamics.SteadyStateInitial then
              der(V_l) = 0;
            end if;
          equation
            m = rho_v*V_v + rho_l*V_l + m_D "Total mass";
            U = rho_v*V_v*h_v + rho_l*V_l*h_l - p*V_t + m_D*cp_D*T_D "Total energy";
            if massDynamics == Types.Dynamics.SteadyState then
              0 = qm_W + qm_S "Steady state mass balance";
            else
              der(m) = qm_W + qm_S "Dynamic mass balance";
            end if;
            if energyDynamics == Types.Dynamics.SteadyState then
              0 = q_F + port_a.m_flow*actualStream(port_a.h_outflow) + port_b.m_flow*actualStream(port_b.h_outflow) "Steady state energy balance";
            else
              der(U) = q_F + port_a.m_flow*actualStream(port_a.h_outflow) + port_b.m_flow*actualStream(port_b.h_outflow) "Dynamic energy balance";
            end if;
            V_t = V_l + V_v;
            sat.psat = p;
            sat.Tsat = T;
            sat.Tsat = Medium.saturationTemperature(p);
            T_D = T;
            port_a.p = p;
            port_a.h_outflow = h_l;
            port_b.p = p;
            port_b.h_outflow = h_v;
            V = V_l;
            assert(p < Medium.fluidConstants[1].criticalPressure - 10000, "Evaporator model requires subcritical pressure");
          end EquilibriumDrumBoiler;
        end BaseClasses;
      end DrumBoiler;
    end Examples;

    model System "System properties and default values (ambient, flow direction, initialization)"
      parameter SI.AbsolutePressure p_ambient = 101325 "Default ambient pressure";
      parameter SI.Temperature T_ambient = 293.15 "Default ambient temperature";
      parameter SI.Acceleration g = Modelica.Constants.g_n "Constant gravity acceleration";
      parameter Boolean allowFlowReversal = true "= false to restrict to design flow direction (port_a -> port_b)" annotation(Evaluate = true);
      parameter Modelica.Fluid.Types.Dynamics energyDynamics = Modelica.Fluid.Types.Dynamics.DynamicFreeInitial "Default formulation of energy balances" annotation(Evaluate = true);
      parameter Modelica.Fluid.Types.Dynamics massDynamics = energyDynamics "Default formulation of mass balances" annotation(Evaluate = true);
      final parameter Modelica.Fluid.Types.Dynamics substanceDynamics = massDynamics "Default formulation of substance balances" annotation(Evaluate = true);
      final parameter Modelica.Fluid.Types.Dynamics traceDynamics = massDynamics "Default formulation of trace substance balances" annotation(Evaluate = true);
      parameter Modelica.Fluid.Types.Dynamics momentumDynamics = Modelica.Fluid.Types.Dynamics.SteadyState "Default formulation of momentum balances, if options available" annotation(Evaluate = true);
      parameter SI.MassFlowRate m_flow_start = 0 "Default start value for mass flow rates";
      parameter SI.AbsolutePressure p_start = p_ambient "Default start value for pressures";
      parameter SI.Temperature T_start = T_ambient "Default start value for temperatures";
      parameter Boolean use_eps_Re = false "= true to determine turbulent region automatically using Reynolds number" annotation(Evaluate = true);
      parameter SI.MassFlowRate m_flow_nominal = if use_eps_Re then 1 else 1e2*m_flow_small "Default nominal mass flow rate";
      parameter Real eps_m_flow(min = 0) = 1e-4 "Regularization of zero flow for |m_flow| < eps_m_flow*m_flow_nominal";
      parameter SI.AbsolutePressure dp_small(min = 0) = 1 "Default small pressure drop for regularization of laminar and zero flow";
      parameter SI.MassFlowRate m_flow_small(min = 0) = 1e-2 "Default small mass flow rate for regularization of laminar and zero flow";
      annotation(defaultComponentPrefixes = "inner", missingInnerMessage = "
    Your model is using an outer \"system\" component but
    an inner \"system\" component is not defined.
    For simulation drag Modelica.Fluid.System into your model
    to specify system properties.");
    end System;

    package Valves "Components for the regulation and control of fluid flow"
      extends Modelica.Icons.VariantsPackage;

      model ValveLinear "Valve for water/steam flows with linear pressure drop"
        extends Modelica.Fluid.Interfaces.PartialTwoPortTransport;
        parameter SI.AbsolutePressure dp_nominal "Nominal pressure drop at full opening";
        parameter Medium.MassFlowRate m_flow_nominal "Nominal mass flowrate at full opening";
        final parameter Types.HydraulicConductance k = m_flow_nominal/dp_nominal "Hydraulic conductance at full opening";
        Modelica.Blocks.Interfaces.RealInput opening(min = 0, max = 1) "=1: completely open, =0: completely closed";
      equation
        m_flow = opening*k*dp;
        port_a.h_outflow = inStream(port_b.h_outflow);
        port_b.h_outflow = inStream(port_a.h_outflow);
      end ValveLinear;
    end Valves;

    package Sources "Define fixed or prescribed boundary conditions"
      extends Modelica.Icons.SourcesPackage;

      model FixedBoundary "Boundary source component"
        import Modelica.Media.Interfaces.Choices.IndependentVariables;
        extends Sources.BaseClasses.PartialSource;
        parameter Boolean use_p = true "Select p or d" annotation(Evaluate = true);
        parameter Medium.AbsolutePressure p = Medium.p_default "Boundary pressure";
        parameter Medium.Density d = (if use_T then Medium.density_pTX(Medium.p_default, Medium.T_default, Medium.X_default) else Medium.density_phX(Medium.p_default, Medium.h_default, Medium.X_default)) "Boundary density";
        parameter Boolean use_T = true "Select T or h" annotation(Evaluate = true);
        parameter Medium.Temperature T = Medium.T_default "Boundary temperature";
        parameter Medium.SpecificEnthalpy h = Medium.h_default "Boundary specific enthalpy";
        parameter Medium.MassFraction X[Medium.nX] = Medium.X_default "Boundary mass fractions m_i/m";
        parameter Medium.ExtraProperty C[Medium.nC](quantity = Medium.extraPropertiesNames) = Medium.C_default "Boundary trace substances";
      protected
        Medium.ThermodynamicState state;
      equation
        Modelica.Fluid.Utilities.checkBoundary(Medium.mediumName, Medium.substanceNames, Medium.singleState, use_p, X, "FixedBoundary");
        if use_p or Medium.singleState then
          if use_T then
            state = Medium.setState_pTX(p, T, X);
          else
            state = Medium.setState_phX(p, h, X);
          end if;
          if Medium.ThermoStates == IndependentVariables.dTX then
            medium.d = Medium.density(state);
          else
            medium.p = Medium.pressure(state);
          end if;
          if Medium.ThermoStates == IndependentVariables.ph or Medium.ThermoStates == IndependentVariables.phX then
            medium.h = Medium.specificEnthalpy(state);
          else
            medium.T = Medium.temperature(state);
          end if;
        else
          if use_T then
            state = Medium.setState_dTX(d, T, X);
            if Medium.ThermoStates == IndependentVariables.dTX then
              medium.d = Medium.density(state);
            else
              medium.p = Medium.pressure(state);
            end if;
            if Medium.ThermoStates == IndependentVariables.ph or Medium.ThermoStates == IndependentVariables.phX then
              medium.h = Medium.specificEnthalpy(state);
            else
              medium.T = Medium.temperature(state);
            end if;
          else
            medium.d = d;
            medium.h = h;
            state = Medium.setState_dTX(d, T, X);
          end if;
        end if;
        medium.Xi = X[1:Medium.nXi];
        ports.C_outflow = fill(C, nPorts);
      end FixedBoundary;

      model MassFlowSource_h "Ideal flow source that produces a prescribed mass flow with prescribed specific enthalpy, mass fraction and trace substances"
        import Modelica.Media.Interfaces.Choices.IndependentVariables;
        extends Sources.BaseClasses.PartialFlowSource(nPorts(min = 1));
        parameter Boolean use_m_flow_in = false "Get the mass flow rate from the input connector" annotation(Evaluate = true, HideResult = true);
        parameter Boolean use_h_in = false "Get the specific enthalpy from the input connector" annotation(Evaluate = true, HideResult = true);
        parameter Boolean use_X_in = false "Get the composition from the input connector" annotation(Evaluate = true, HideResult = true);
        parameter Boolean use_C_in = false "Get the trace substances from the input connector" annotation(Evaluate = true, HideResult = true);
        parameter Medium.MassFlowRate m_flow = 0 "Fixed mass flow rate going out of the fluid port";
        parameter Medium.SpecificEnthalpy h = Medium.h_default "Fixed value of specific enthalpy";
        parameter Medium.MassFraction X[Medium.nX] = Medium.X_default "Fixed value of composition";
        parameter Medium.ExtraProperty C[Medium.nC](quantity = Medium.extraPropertiesNames) = Medium.C_default "Fixed values of trace substances";
        Modelica.Blocks.Interfaces.RealInput m_flow_in(unit = "kg/s") if use_m_flow_in "Prescribed mass flow rate";
        Modelica.Blocks.Interfaces.RealInput h_in(unit = "J/kg") if use_h_in "Prescribed fluid specific enthalpy";
        Modelica.Blocks.Interfaces.RealInput X_in[Medium.nX](each unit = "1") if use_X_in "Prescribed fluid composition";
        Modelica.Blocks.Interfaces.RealInput C_in[Medium.nC] if use_C_in "Prescribed boundary trace substances";
      protected
        Modelica.Blocks.Interfaces.RealInput m_flow_in_internal(unit = "kg/s") "Needed to connect to conditional connector";
        Modelica.Blocks.Interfaces.RealInput h_in_internal(unit = "J/kg") "Needed to connect to conditional connector";
        Modelica.Blocks.Interfaces.RealInput X_in_internal[Medium.nX](each unit = "1") "Needed to connect to conditional connector";
        Modelica.Blocks.Interfaces.RealInput C_in_internal[Medium.nC] "Needed to connect to conditional connector";
      equation
        Utilities.checkBoundary(Medium.mediumName, Medium.substanceNames, Medium.singleState, true, X_in_internal, "MassFlowSource_h");
        connect(m_flow_in, m_flow_in_internal);
        connect(h_in, h_in_internal);
        connect(X_in, X_in_internal);
        connect(C_in, C_in_internal);
        if not use_m_flow_in then
          m_flow_in_internal = m_flow;
        end if;
        if not use_h_in then
          h_in_internal = h;
        end if;
        if not use_X_in then
          X_in_internal = X;
        end if;
        if not use_C_in then
          C_in_internal = C;
        end if;
        if Medium.ThermoStates == IndependentVariables.ph or Medium.ThermoStates == IndependentVariables.phX then
          medium.h = h_in_internal;
        else
          medium.T = Medium.temperature(Medium.setState_phX(medium.p, h_in_internal, X_in_internal));
        end if;
        sum(ports.m_flow) = -m_flow_in_internal;
        medium.Xi = X_in_internal[1:Medium.nXi];
        ports.C_outflow = fill(C_in_internal, nPorts);
      end MassFlowSource_h;

      package BaseClasses "Base classes used in the Sources package (only of interest to build new component models)"
        extends Modelica.Icons.BasesPackage;

        partial model PartialSource "Partial component source with one fluid connector"
          import Modelica.Constants;
          parameter Integer nPorts = 0 "Number of ports";
          replaceable package Medium = Modelica.Media.Interfaces.PartialMedium "Medium model within the source" annotation(choicesAllMatching = true);
          Medium.BaseProperties medium "Medium in the source";
          Interfaces.FluidPorts_b ports[nPorts](redeclare each package Medium = Medium, m_flow(each max = if flowDirection == Types.PortFlowDirection.Leaving then 0 else +Constants.inf, each min = if flowDirection == Types.PortFlowDirection.Entering then 0 else -Constants.inf));
        protected
          parameter Types.PortFlowDirection flowDirection = Types.PortFlowDirection.Bidirectional "Allowed flow direction" annotation(Evaluate = true);
        equation
          for i in 1:nPorts loop
            assert(cardinality(ports[i]) <= 1, "
        each ports[i] of boundary shall at most be connected to one component.
        If two or more connections are present, ideal mixing takes
        place with these connections, which is usually not the intention
        of the modeller. Increase nPorts to add an additional port.
            ");
            ports[i].p = medium.p;
            ports[i].h_outflow = medium.h;
            ports[i].Xi_outflow = medium.Xi;
          end for;
        end PartialSource;

        partial model PartialFlowSource "Partial component source with one fluid connector"
          import Modelica.Constants;
          parameter Integer nPorts = 0 "Number of ports";
          replaceable package Medium = Modelica.Media.Interfaces.PartialMedium "Medium model within the source" annotation(choicesAllMatching = true);
          Medium.BaseProperties medium "Medium in the source";
          Interfaces.FluidPort_b ports[nPorts](redeclare each package Medium = Medium, m_flow(each max = if flowDirection == Types.PortFlowDirection.Leaving then 0 else +Constants.inf, each min = if flowDirection == Types.PortFlowDirection.Entering then 0 else -Constants.inf));
        protected
          parameter Types.PortFlowDirection flowDirection = Types.PortFlowDirection.Bidirectional "Allowed flow direction" annotation(Evaluate = true);
        equation
          assert(abs(sum(abs(ports.m_flow)) - max(abs(ports.m_flow))) <= Modelica.Constants.small, "FlowSource only supports one connection with flow");
          assert(nPorts > 0, "At least one port needs to be present (nPorts > 0), otherwise the model is singular");
          for i in 1:nPorts loop
            assert(cardinality(ports[i]) <= 1, "
        each ports[i] of boundary shall at most be connected to one component.
        If two or more connections are present, ideal mixing takes
        place with these connections, which is usually not the intention
        of the modeller. Increase nPorts to add an additional port.
            ");
            ports[i].p = medium.p;
            ports[i].h_outflow = medium.h;
            ports[i].Xi_outflow = medium.Xi;
          end for;
        end PartialFlowSource;
      end BaseClasses;
    end Sources;

    package Sensors "Ideal sensor components to extract signals from a fluid connector"
      extends Modelica.Icons.SensorsPackage;

      model Pressure "Ideal pressure sensor"
        extends Sensors.BaseClasses.PartialAbsoluteSensor;
        extends Modelica.Icons.RoundSensor;
        Modelica.Blocks.Interfaces.RealOutput p(final quantity = "Pressure", final unit = "Pa", displayUnit = "bar", min = 0) "Pressure at port";
      equation
        p = port.p;
      end Pressure;

      model Temperature "Ideal one port temperature sensor"
        extends Sensors.BaseClasses.PartialAbsoluteSensor;
        Modelica.Blocks.Interfaces.RealOutput T(final quantity = "ThermodynamicTemperature", final unit = "K", displayUnit = "degC", min = 0) "Temperature in port medium";
      equation
        T = Medium.temperature(Medium.setState_phX(port.p, inStream(port.h_outflow), inStream(port.Xi_outflow)));
      end Temperature;

      model MassFlowRate "Ideal sensor for mass flow rate"
        extends Sensors.BaseClasses.PartialFlowSensor;
        extends Modelica.Icons.RoundSensor;
        Modelica.Blocks.Interfaces.RealOutput m_flow(quantity = "MassFlowRate", final unit = "kg/s") "Mass flow rate from port_a to port_b";
      equation
        m_flow = port_a.m_flow;
      end MassFlowRate;

      package BaseClasses "Base classes used in the Sensors package (only of interest to build new component models)"
        extends Modelica.Icons.BasesPackage;

        partial model PartialAbsoluteSensor "Partial component to model a sensor that measures a potential variable"
          replaceable package Medium = Modelica.Media.Interfaces.PartialMedium "Medium in the sensor" annotation(choicesAllMatching = true);
          Modelica.Fluid.Interfaces.FluidPort_a port(redeclare package Medium = Medium, m_flow(min = 0));
        equation
          port.m_flow = 0;
          port.h_outflow = Medium.h_default;
          port.Xi_outflow = Medium.X_default[1:Medium.nXi];
          port.C_outflow = zeros(Medium.nC);
        end PartialAbsoluteSensor;

        partial model PartialFlowSensor "Partial component to model sensors that measure flow properties"
          extends Modelica.Fluid.Interfaces.PartialTwoPort;
          parameter Medium.MassFlowRate m_flow_nominal = system.m_flow_nominal "Nominal value of m_flow = port_a.m_flow";
          parameter Medium.MassFlowRate m_flow_small(min = 0) = if system.use_eps_Re then system.eps_m_flow*m_flow_nominal else system.m_flow_small "Regularization for bi-directional flow in the region |m_flow| < m_flow_small (m_flow_small > 0 required)";
        equation
          0 = port_a.m_flow + port_b.m_flow;
          port_a.p = port_b.p;
          port_a.h_outflow = inStream(port_b.h_outflow);
          port_b.h_outflow = inStream(port_a.h_outflow);
          port_a.Xi_outflow = inStream(port_b.Xi_outflow);
          port_b.Xi_outflow = inStream(port_a.Xi_outflow);
          port_a.C_outflow = inStream(port_b.C_outflow);
          port_b.C_outflow = inStream(port_a.C_outflow);
        end PartialFlowSensor;
      end BaseClasses;
    end Sensors;

    package Interfaces "Interfaces for steady state and unsteady, mixed-phase, multi-substance, incompressible and compressible flow"
      extends Modelica.Icons.InterfacesPackage;

      connector FluidPort "Interface for quasi one-dimensional fluid flow in a piping network (incompressible or compressible, one or more phases, one or more substances)"
        replaceable package Medium = Modelica.Media.Interfaces.PartialMedium "Medium model" annotation(choicesAllMatching = true);
        flow Medium.MassFlowRate m_flow "Mass flow rate from the connection point into the component";
        Medium.AbsolutePressure p "Thermodynamic pressure in the connection point";
        stream Medium.SpecificEnthalpy h_outflow "Specific thermodynamic enthalpy close to the connection point if m_flow < 0";
        stream Medium.MassFraction Xi_outflow[Medium.nXi] "Independent mixture mass fractions m_i/m close to the connection point if m_flow < 0";
        stream Medium.ExtraProperty C_outflow[Medium.nC] "Properties c_i/m close to the connection point if m_flow < 0";
      end FluidPort;

      connector FluidPort_a "Generic fluid connector at design inlet"
        extends FluidPort;
      end FluidPort_a;

      connector FluidPort_b "Generic fluid connector at design outlet"
        extends FluidPort;
      end FluidPort_b;

      connector FluidPorts_b "Fluid connector with outlined, large icon to be used for vectors of FluidPorts (vector dimensions must be added after dragging)"
        extends FluidPort;
      end FluidPorts_b;

      partial model PartialTwoPort "Partial component with two ports"
        import Modelica.Constants;
        outer Modelica.Fluid.System system "System wide properties";
        replaceable package Medium = Modelica.Media.Interfaces.PartialMedium "Medium in the component" annotation(choicesAllMatching = true);
        parameter Boolean allowFlowReversal = system.allowFlowReversal "= true to allow flow reversal, false restricts to design direction (port_a -> port_b)" annotation(Evaluate = true);
        Modelica.Fluid.Interfaces.FluidPort_a port_a(redeclare package Medium = Medium, m_flow(min = if allowFlowReversal then -Constants.inf else 0)) "Fluid connector a (positive design flow direction is from port_a to port_b)";
        Modelica.Fluid.Interfaces.FluidPort_b port_b(redeclare package Medium = Medium, m_flow(max = if allowFlowReversal then +Constants.inf else 0)) "Fluid connector b (positive design flow direction is from port_a to port_b)";
      protected
        parameter Boolean port_a_exposesState = false "= true if port_a exposes the state of a fluid volume";
        parameter Boolean port_b_exposesState = false "= true if port_b.p exposes the state of a fluid volume";
        parameter Boolean showDesignFlowDirection = true "= false to hide the arrow in the model icon";
      end PartialTwoPort;

      partial model PartialTwoPortTransport "Partial element transporting fluid between two ports without storage of mass or energy"
        extends PartialTwoPort(final port_a_exposesState = false, final port_b_exposesState = false);
        parameter Medium.AbsolutePressure dp_start(min = -Modelica.Constants.inf) = 0.01*system.p_start "Guess value of dp = port_a.p - port_b.p";
        parameter Medium.MassFlowRate m_flow_start = system.m_flow_start "Guess value of m_flow = port_a.m_flow";
        parameter Medium.MassFlowRate m_flow_small = if system.use_eps_Re then system.eps_m_flow*system.m_flow_nominal else system.m_flow_small "Small mass flow rate for regularization of zero flow";
        parameter Boolean show_T = true "= true, if temperatures at port_a and port_b are computed";
        parameter Boolean show_V_flow = true "= true, if volume flow rate at inflowing port is computed";
        Medium.MassFlowRate m_flow(min = if allowFlowReversal then -Modelica.Constants.inf else 0, start = m_flow_start) "Mass flow rate in design flow direction";
        SI.Pressure dp(start = dp_start) "Pressure difference between port_a and port_b (= port_a.p - port_b.p)";
        SI.VolumeFlowRate V_flow = m_flow/Modelica.Fluid.Utilities.regStep(m_flow, Medium.density(state_a), Medium.density(state_b), m_flow_small) if show_V_flow "Volume flow rate at inflowing port (positive when flow from port_a to port_b)";
        Medium.Temperature port_a_T = Modelica.Fluid.Utilities.regStep(port_a.m_flow, Medium.temperature(state_a), Medium.temperature(Medium.setState_phX(port_a.p, port_a.h_outflow, port_a.Xi_outflow)), m_flow_small) if show_T "Temperature close to port_a, if show_T = true";
        Medium.Temperature port_b_T = Modelica.Fluid.Utilities.regStep(port_b.m_flow, Medium.temperature(state_b), Medium.temperature(Medium.setState_phX(port_b.p, port_b.h_outflow, port_b.Xi_outflow)), m_flow_small) if show_T "Temperature close to port_b, if show_T = true";
      protected
        Medium.ThermodynamicState state_a "State for medium inflowing through port_a";
        Medium.ThermodynamicState state_b "State for medium inflowing through port_b";
      equation
        state_a = Medium.setState_phX(port_a.p, inStream(port_a.h_outflow), inStream(port_a.Xi_outflow));
        state_b = Medium.setState_phX(port_b.p, inStream(port_b.h_outflow), inStream(port_b.Xi_outflow));
        dp = port_a.p - port_b.p;
        m_flow = port_a.m_flow;
        assert(m_flow > -m_flow_small or allowFlowReversal, "Reversing flow occurs even though allowFlowReversal is false");
        port_a.m_flow + port_b.m_flow = 0;
        port_a.Xi_outflow = inStream(port_b.Xi_outflow);
        port_b.Xi_outflow = inStream(port_a.Xi_outflow);
        port_a.C_outflow = inStream(port_b.C_outflow);
        port_b.C_outflow = inStream(port_a.C_outflow);
      end PartialTwoPortTransport;
    end Interfaces;

    package Types "Common types for fluid models"
      extends Modelica.Icons.TypesPackage;
      type HydraulicConductance = Modelica.Icons.TypeReal(final quantity = "HydraulicConductance", final unit = "kg/(s.Pa)") "Real type for hydraulic conductance";
      type Dynamics = enumeration(DynamicFreeInitial "DynamicFreeInitial -- Dynamic balance, Initial guess value", FixedInitial "FixedInitial -- Dynamic balance, Initial value fixed", SteadyStateInitial "SteadyStateInitial -- Dynamic balance, Steady state initial with guess value", SteadyState "SteadyState -- Steady state balance, Initial guess value") "Enumeration to define definition of balance equations";
      type PortFlowDirection = enumeration(Entering "Fluid flow is only entering", Leaving "Fluid flow is only leaving", Bidirectional "No restrictions on fluid flow (flow reversal possible)") "Enumeration to define whether flow reversal is allowed";
    end Types;

    package Utilities "Utility models to construct fluid components (should not be used directly)"
      extends Modelica.Icons.UtilitiesPackage;

      function checkBoundary "Check whether boundary definition is correct"
        extends Modelica.Icons.Function;
        input String mediumName;
        input String substanceNames[:] "Names of substances";
        input Boolean singleState;
        input Boolean define_p;
        input Real X_boundary[:];
        input String modelName = "??? boundary ???";
      protected
        Integer nX = size(X_boundary, 1);
        String X_str;
      algorithm
        assert(not singleState or singleState and define_p, "
      Wrong value of parameter define_p (= false) in model \"" + modelName + "\":
      The selected medium \"" + mediumName + "\" has Medium.singleState=true.
      Therefore, an boundary density cannot be defined and
      define_p = true is required.
        ");
        for i in 1:nX loop
          assert(X_boundary[i] >= 0.0, "
      Wrong boundary mass fractions in medium \"" + mediumName + "\" in model \"" + modelName + "\":
      The boundary value X_boundary(" + String(i) + ") = " + String(X_boundary[i]) + "
      is negative. It must be positive.
          ");
        end for;
        if nX > 0 and abs(sum(X_boundary) - 1.0) > 1e-10 then
          X_str := "";
          for i in 1:nX loop
            X_str := X_str + "   X_boundary[" + String(i) + "] = " + String(X_boundary[i]) + " \"" + substanceNames[i] + "\"\n";
          end for;
          Modelica.Utilities.Streams.error("The boundary mass fractions in medium \"" + mediumName + "\" in model \"" + modelName + "\"\n" + "do not sum up to 1. Instead, sum(X_boundary) = " + String(sum(X_boundary)) + ":\n" + X_str);
        else
        end if;
      end checkBoundary;

      function regStep "Approximation of a general step, such that the characteristic is continuous and differentiable"
        extends Modelica.Icons.Function;
        input Real x "Abscissa value";
        input Real y1 "Ordinate value for x > 0";
        input Real y2 "Ordinate value for x < 0";
        input Real x_small(min = 0) = 1e-5 "Approximation of step for -x_small <= x <= x_small; x_small >= 0 required";
        output Real y "Ordinate value to approximate y = if x > 0 then y1 else y2";
      algorithm
        y := smooth(1, if x > x_small then y1 else if x < -x_small then y2 else if x_small > 0 then (x/x_small)*((x/x_small)^2 - 3)*(y2 - y1)/4 + (y1 + y2)/2 else (y1 + y2)/2);
      end regStep;
    end Utilities;
  end Fluid;

  package Media "Library of media property models"
    extends Modelica.Icons.Package;
    import Modelica.Units.SI;
    import Cv = Modelica.Units.Conversions;

    package Interfaces "Interfaces for media models"
      extends Modelica.Icons.InterfacesPackage;

      partial package PartialMedium "Partial medium properties (base package of all media packages)"
        extends Modelica.Media.Interfaces.Types;
        extends Modelica.Icons.MaterialPropertiesPackage;
        constant Modelica.Media.Interfaces.Choices.IndependentVariables ThermoStates "Enumeration type for independent variables";
        constant String mediumName = "unusablePartialMedium" "Name of the medium";
        constant String substanceNames[:] = {mediumName} "Names of the mixture substances. Set substanceNames={mediumName} if only one substance.";
        constant String extraPropertiesNames[:] = fill("", 0) "Names of the additional (extra) transported properties. Set extraPropertiesNames=fill(\"\",0) if unused";
        constant Boolean singleState "= true, if u and d are not a function of pressure";
        constant Boolean reducedX = true "= true, if medium contains the equation sum(X) = 1.0; set reducedX=true, if only one substance (see docu for details)";
        constant Boolean fixedX = false "= true, if medium contains the equation X = reference_X";
        constant MassFraction reference_X[nX] = fill(1/nX, nX) "Default mass fractions of medium";
        constant AbsolutePressure p_default = 101325 "Default value for pressure of medium (for initialization)";
        constant Temperature T_default = Modelica.Units.Conversions.from_degC(20) "Default value for temperature of medium (for initialization)";
        constant SpecificEnthalpy h_default = specificEnthalpy_pTX(p_default, T_default, X_default) "Default value for specific enthalpy of medium (for initialization)";
        constant MassFraction X_default[nX] = reference_X "Default value for mass fractions of medium (for initialization)";
        constant ExtraProperty C_default[nC] = fill(0, nC) "Default value for trace substances of medium (for initialization)";
        final constant Integer nS = size(substanceNames, 1) "Number of substances";
        constant Integer nX = nS "Number of mass fractions";
        constant Integer nXi = if fixedX then 0 else if reducedX then nS - 1 else nS "Number of structurally independent mass fractions (see docu for details)";
        final constant Integer nC = size(extraPropertiesNames, 1) "Number of extra (outside of standard mass-balance) transported properties";
        replaceable record FluidConstants = Modelica.Media.Interfaces.Types.Basic.FluidConstants "Critical, triple, molecular and other standard data of fluid";

        replaceable record ThermodynamicState "Minimal variable set that is available as input argument to every medium function"
          extends Modelica.Icons.Record;
        end ThermodynamicState;

        replaceable partial model BaseProperties "Base properties (p, d, T, h, u, R_s, MM and, if applicable, X and Xi) of a medium"
          InputAbsolutePressure p "Absolute pressure of medium";
          InputMassFraction Xi[nXi](start = reference_X[1:nXi]) "Structurally independent mass fractions";
          InputSpecificEnthalpy h "Specific enthalpy of medium";
          Density d "Density of medium";
          Temperature T "Temperature of medium";
          MassFraction X[nX](start = reference_X) "Mass fractions (= (component mass)/total mass  m_i/m)";
          SpecificInternalEnergy u "Specific internal energy of medium";
          SpecificHeatCapacity R_s "Gas constant (of mixture if applicable)";
          MolarMass MM "Molar mass (of mixture or single fluid)";
          ThermodynamicState state "Thermodynamic state record for optional functions";
          parameter Boolean preferredMediumStates = false "= true, if StateSelect.prefer shall be used for the independent property variables of the medium" annotation(Evaluate = true);
          parameter Boolean standardOrderComponents = true "If true, and reducedX = true, the last element of X will be computed from the other ones";
          Modelica.Units.NonSI.Temperature_degC T_degC = Modelica.Units.Conversions.to_degC(T) "Temperature of medium in [degC]";
          Modelica.Units.NonSI.Pressure_bar p_bar = Modelica.Units.Conversions.to_bar(p) "Absolute pressure of medium in [bar]";
          connector InputAbsolutePressure = input SI.AbsolutePressure "Pressure as input signal connector";
          connector InputSpecificEnthalpy = input SI.SpecificEnthalpy "Specific enthalpy as input signal connector";
          connector InputMassFraction = input SI.MassFraction "Mass fraction as input signal connector";
        equation
          if standardOrderComponents then
            Xi = X[1:nXi];
            if fixedX then
              X = reference_X;
            end if;
            if reducedX and not fixedX then
              X[nX] = 1 - sum(Xi);
            end if;
            for i in 1:nX loop
              assert(X[i] >= -1.e-5 and X[i] <= 1 + 1.e-5, "Mass fraction X[" + String(i) + "] = " + String(X[i]) + "of substance " + substanceNames[i] + "\nof medium " + mediumName + " is not in the range 0..1");
            end for;
          end if;
          assert(p >= 0.0, "Pressure (= " + String(p) + " Pa) of medium \"" + mediumName + "\" is negative\n(Temperature = " + String(T) + " K)");
        end BaseProperties;

        replaceable partial function setState_pTX "Return thermodynamic state as function of p, T and composition X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input MassFraction X[:] = reference_X "Mass fractions";
          output ThermodynamicState state "Thermodynamic state record";
        end setState_pTX;

        replaceable partial function setState_phX "Return thermodynamic state as function of p, h and composition X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input MassFraction X[:] = reference_X "Mass fractions";
          output ThermodynamicState state "Thermodynamic state record";
        end setState_phX;

        replaceable partial function setState_psX "Return thermodynamic state as function of p, s and composition X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input MassFraction X[:] = reference_X "Mass fractions";
          output ThermodynamicState state "Thermodynamic state record";
        end setState_psX;

        replaceable partial function setState_dTX "Return thermodynamic state as function of d, T and composition X or Xi"
          extends Modelica.Icons.Function;
          input Density d "Density";
          input Temperature T "Temperature";
          input MassFraction X[:] = reference_X "Mass fractions";
          output ThermodynamicState state "Thermodynamic state record";
        end setState_dTX;

        replaceable partial function setSmoothState "Return thermodynamic state so that it smoothly approximates: if x > 0 then state_a else state_b"
          extends Modelica.Icons.Function;
          input Real x "m_flow or dp";
          input ThermodynamicState state_a "Thermodynamic state if x > 0";
          input ThermodynamicState state_b "Thermodynamic state if x < 0";
          input Real x_small(min = 0) "Smooth transition in the region -x_small < x < x_small";
          output ThermodynamicState state "Smooth thermodynamic state for all x (continuous and differentiable)";
        end setSmoothState;

        replaceable partial function dynamicViscosity "Return dynamic viscosity"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output DynamicViscosity eta "Dynamic viscosity";
        end dynamicViscosity;

        replaceable partial function thermalConductivity "Return thermal conductivity"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output ThermalConductivity lambda "Thermal conductivity";
        end thermalConductivity;

        replaceable partial function pressure "Return pressure"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output AbsolutePressure p "Pressure";
        end pressure;

        replaceable partial function temperature "Return temperature"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output Temperature T "Temperature";
        end temperature;

        replaceable partial function density "Return density"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output Density d "Density";
        end density;

        replaceable partial function specificEnthalpy "Return specific enthalpy"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SpecificEnthalpy h "Specific enthalpy";
        end specificEnthalpy;

        replaceable partial function specificInternalEnergy "Return specific internal energy"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SpecificEnergy u "Specific internal energy";
        end specificInternalEnergy;

        replaceable partial function specificEntropy "Return specific entropy"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SpecificEntropy s "Specific entropy";
        end specificEntropy;

        replaceable partial function specificGibbsEnergy "Return specific Gibbs energy"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SpecificEnergy g "Specific Gibbs energy";
        end specificGibbsEnergy;

        replaceable partial function specificHelmholtzEnergy "Return specific Helmholtz energy"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SpecificEnergy f "Specific Helmholtz energy";
        end specificHelmholtzEnergy;

        replaceable partial function specificHeatCapacityCp "Return specific heat capacity at constant pressure"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SpecificHeatCapacity cp "Specific heat capacity at constant pressure";
        end specificHeatCapacityCp;

        replaceable partial function specificHeatCapacityCv "Return specific heat capacity at constant volume"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SpecificHeatCapacity cv "Specific heat capacity at constant volume";
        end specificHeatCapacityCv;

        replaceable partial function isentropicExponent "Return isentropic exponent"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output IsentropicExponent gamma "Isentropic exponent";
        end isentropicExponent;

        replaceable partial function isentropicEnthalpy "Return isentropic enthalpy"
          extends Modelica.Icons.Function;
          input AbsolutePressure p_downstream "Downstream pressure";
          input ThermodynamicState refState "Reference state for entropy";
          output SpecificEnthalpy h_is "Isentropic enthalpy";
        end isentropicEnthalpy;

        replaceable partial function velocityOfSound "Return velocity of sound"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output VelocityOfSound a "Velocity of sound";
        end velocityOfSound;

        replaceable partial function isobaricExpansionCoefficient "Return overall the isobaric expansion coefficient beta"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output IsobaricExpansionCoefficient beta "Isobaric expansion coefficient";
        end isobaricExpansionCoefficient;

        replaceable partial function isothermalCompressibility "Return overall the isothermal compressibility factor"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output SI.IsothermalCompressibility kappa "Isothermal compressibility";
        end isothermalCompressibility;

        replaceable partial function density_derp_h "Return density derivative w.r.t. pressure at constant specific enthalpy"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output DerDensityByPressure ddph "Density derivative w.r.t. pressure";
        end density_derp_h;

        replaceable partial function density_derh_p "Return density derivative w.r.t. specific enthalpy at constant pressure"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output DerDensityByEnthalpy ddhp "Density derivative w.r.t. specific enthalpy";
        end density_derh_p;

        replaceable partial function molarMass "Return the molar mass of the medium"
          extends Modelica.Icons.Function;
          input ThermodynamicState state "Thermodynamic state record";
          output MolarMass MM "Mixture molar mass";
        end molarMass;

        replaceable function specificEnthalpy_pTX "Return specific enthalpy from p, T, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input MassFraction X[:] = reference_X "Mass fractions";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy(setState_pTX(p, T, X));
          annotation(inverse(T = temperature_phX(p, h, X)));
        end specificEnthalpy_pTX;

        replaceable function specificEntropy_pTX "Return specific entropy from p, T, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input MassFraction X[:] = reference_X "Mass fractions";
          output SpecificEntropy s "Specific entropy";
        algorithm
          s := specificEntropy(setState_pTX(p, T, X));
          annotation(inverse(T = temperature_psX(p, s, X)));
        end specificEntropy_pTX;

        replaceable function density_pTX "Return density from p, T, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input MassFraction X[:] "Mass fractions";
          output Density d "Density";
        algorithm
          d := density(setState_pTX(p, T, X));
        end density_pTX;

        replaceable function temperature_phX "Return temperature from p, h, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input MassFraction X[:] = reference_X "Mass fractions";
          output Temperature T "Temperature";
        algorithm
          T := temperature(setState_phX(p, h, X));
        end temperature_phX;

        replaceable function density_phX "Return density from p, h, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input MassFraction X[:] = reference_X "Mass fractions";
          output Density d "Density";
        algorithm
          d := density(setState_phX(p, h, X));
        end density_phX;

        replaceable function temperature_psX "Return temperature from p, s, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input MassFraction X[:] = reference_X "Mass fractions";
          output Temperature T "Temperature";
        algorithm
          T := temperature(setState_psX(p, s, X));
          annotation(inverse(s = specificEntropy_pTX(p, T, X)));
        end temperature_psX;

        replaceable function density_psX "Return density from p, s, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input MassFraction X[:] = reference_X "Mass fractions";
          output Density d "Density";
        algorithm
          d := density(setState_psX(p, s, X));
        end density_psX;

        replaceable function specificEnthalpy_psX "Return specific enthalpy from p, s, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input MassFraction X[:] = reference_X "Mass fractions";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy(setState_psX(p, s, X));
        end specificEnthalpy_psX;

        type MassFlowRate = SI.MassFlowRate(quantity = "MassFlowRate." + mediumName, min = -1.0e5, max = 1.e5) "Type for mass flow rate with medium specific attributes";
      end PartialMedium;

      partial package PartialPureSubstance "Base class for pure substances of one chemical substance"
        extends PartialMedium(final reducedX = true, final fixedX = true);

        replaceable function density_ph "Return density from p and h"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          output Density d "Density";
        algorithm
          d := density_phX(p, h, fill(0.0, 0));
        end density_ph;

        replaceable function temperature_ph "Return temperature from p and h"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          output Temperature T "Temperature";
        algorithm
          T := temperature_phX(p, h, fill(0.0, 0));
        end temperature_ph;

        replaceable function pressure_dT "Return pressure from d and T"
          extends Modelica.Icons.Function;
          input Density d "Density";
          input Temperature T "Temperature";
          output AbsolutePressure p "Pressure";
        algorithm
          p := pressure(setState_dTX(d, T, fill(0.0, 0)));
        end pressure_dT;

        replaceable function specificEnthalpy_dT "Return specific enthalpy from d and T"
          extends Modelica.Icons.Function;
          input Density d "Density";
          input Temperature T "Temperature";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy(setState_dTX(d, T, fill(0.0, 0)));
        end specificEnthalpy_dT;

        replaceable function specificEnthalpy_ps "Return specific enthalpy from p and s"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy_psX(p, s, fill(0.0, 0));
        end specificEnthalpy_ps;

        replaceable function temperature_ps "Return temperature from p and s"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          output Temperature T "Temperature";
        algorithm
          T := temperature_psX(p, s, fill(0.0, 0));
        end temperature_ps;

        replaceable function density_ps "Return density from p and s"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          output Density d "Density";
        algorithm
          d := density_psX(p, s, fill(0.0, 0));
        end density_ps;

        replaceable function specificEnthalpy_pT "Return specific enthalpy from p and T"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy_pTX(p, T, fill(0.0, 0));
        end specificEnthalpy_pT;

        replaceable function density_pT "Return density from p and T"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          output Density d "Density";
        algorithm
          d := density(setState_pTX(p, T, fill(0.0, 0)));
        end density_pT;

        redeclare replaceable partial model extends BaseProperties(final standardOrderComponents = true) end BaseProperties;
      end PartialPureSubstance;

      partial package PartialTwoPhaseMedium "Base class for two phase medium of one substance"
        extends PartialPureSubstance(redeclare replaceable record FluidConstants = Modelica.Media.Interfaces.Types.TwoPhase.FluidConstants);
        constant Boolean smoothModel = false "= true, if the (derived) model should not generate state events";
        constant Boolean onePhase = false "= true, if the (derived) model should never be called with two-phase inputs";
        constant FluidConstants fluidConstants[nS] "Constant data for the fluid";

        redeclare replaceable record extends ThermodynamicState "Thermodynamic state of two phase medium"
          FixedPhase phase(min = 0, max = 2) "Phase of the fluid: 1 for 1-phase, 2 for two-phase, 0 for not known, e.g., interactive use";
        end ThermodynamicState;

        redeclare replaceable partial model extends BaseProperties "Base properties (p, d, T, h, u, R_s, MM, sat) of two phase medium"
          SaturationProperties sat "Saturation properties at the medium pressure";
        end BaseProperties;

        replaceable partial function setDewState "Return the thermodynamic state on the dew line"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation point";
          input FixedPhase phase(min = 1, max = 2) = 1 "Phase: default is one phase";
          output ThermodynamicState state "Complete thermodynamic state info";
        end setDewState;

        replaceable partial function setBubbleState "Return the thermodynamic state on the bubble line"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation point";
          input FixedPhase phase(min = 1, max = 2) = 1 "Phase: default is one phase";
          output ThermodynamicState state "Complete thermodynamic state info";
        end setBubbleState;

        redeclare replaceable partial function extends setState_dTX "Return thermodynamic state as function of d, T and composition X or Xi"
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
        end setState_dTX;

        redeclare replaceable partial function extends setState_phX "Return thermodynamic state as function of p, h and composition X or Xi"
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
        end setState_phX;

        redeclare replaceable partial function extends setState_psX "Return thermodynamic state as function of p, s and composition X or Xi"
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
        end setState_psX;

        redeclare replaceable partial function extends setState_pTX "Return thermodynamic state as function of p, T and composition X or Xi"
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
        end setState_pTX;

        replaceable partial function bubbleEnthalpy "Return bubble point specific enthalpy"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output SI.SpecificEnthalpy hl "Boiling curve specific enthalpy";
        end bubbleEnthalpy;

        replaceable partial function dewEnthalpy "Return dew point specific enthalpy"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output SI.SpecificEnthalpy hv "Dew curve specific enthalpy";
        end dewEnthalpy;

        replaceable partial function bubbleEntropy "Return bubble point specific entropy"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output SI.SpecificEntropy sl "Boiling curve specific entropy";
        end bubbleEntropy;

        replaceable partial function dewEntropy "Return dew point specific entropy"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output SI.SpecificEntropy sv "Dew curve specific entropy";
        end dewEntropy;

        replaceable partial function bubbleDensity "Return bubble point density"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output Density dl "Boiling curve density";
        end bubbleDensity;

        replaceable partial function dewDensity "Return dew point density"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output Density dv "Dew curve density";
        end dewDensity;

        replaceable partial function saturationPressure "Return saturation pressure"
          extends Modelica.Icons.Function;
          input Temperature T "Temperature";
          output AbsolutePressure p "Saturation pressure";
        end saturationPressure;

        replaceable partial function saturationTemperature "Return saturation temperature"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          output Temperature T "Saturation temperature";
        end saturationTemperature;

        replaceable partial function saturationTemperature_derp "Return derivative of saturation temperature w.r.t. pressure"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          output DerTemperatureByPressure dTp "Derivative of saturation temperature w.r.t. pressure";
        end saturationTemperature_derp;

        replaceable partial function surfaceTension "Return surface tension sigma in the two phase region"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output SurfaceTension sigma "Surface tension sigma in the two phase region";
        end surfaceTension;

        redeclare replaceable function extends molarMass "Return the molar mass of the medium"
        algorithm
          MM := fluidConstants[1].molarMass;
        end molarMass;

        replaceable partial function dBubbleDensity_dPressure "Return bubble point density derivative"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output DerDensityByPressure ddldp "Boiling curve density derivative";
        end dBubbleDensity_dPressure;

        replaceable partial function dDewDensity_dPressure "Return dew point density derivative"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output DerDensityByPressure ddvdp "Saturated steam density derivative";
        end dDewDensity_dPressure;

        replaceable partial function dBubbleEnthalpy_dPressure "Return bubble point specific enthalpy derivative"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output DerEnthalpyByPressure dhldp "Boiling curve specific enthalpy derivative";
        end dBubbleEnthalpy_dPressure;

        replaceable partial function dDewEnthalpy_dPressure "Return dew point specific enthalpy derivative"
          extends Modelica.Icons.Function;
          input SaturationProperties sat "Saturation property record";
          output DerEnthalpyByPressure dhvdp "Saturated steam specific enthalpy derivative";
        end dDewEnthalpy_dPressure;

        redeclare replaceable function specificEnthalpy_pTX "Return specific enthalpy from pressure, temperature and mass fraction"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input MassFraction X[:] "Mass fractions";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output SpecificEnthalpy h "Specific enthalpy at p, T, X";
        algorithm
          h := specificEnthalpy(setState_pTX(p, T, X, phase));
        end specificEnthalpy_pTX;

        redeclare replaceable function temperature_phX "Return temperature from p, h, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input MassFraction X[:] "Mass fractions";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Temperature T "Temperature";
        algorithm
          T := temperature(setState_phX(p, h, X, phase));
        end temperature_phX;

        redeclare replaceable function density_phX "Return density from p, h, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input MassFraction X[:] "Mass fractions";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Density d "Density";
        algorithm
          d := density(setState_phX(p, h, X, phase));
        end density_phX;

        redeclare replaceable function temperature_psX "Return temperature from p, s, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input MassFraction X[:] "Mass fractions";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Temperature T "Temperature";
        algorithm
          T := temperature(setState_psX(p, s, X, phase));
        end temperature_psX;

        redeclare replaceable function density_psX "Return density from p, s, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input MassFraction X[:] "Mass fractions";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Density d "Density";
        algorithm
          d := density(setState_psX(p, s, X, phase));
        end density_psX;

        redeclare replaceable function specificEnthalpy_psX "Return specific enthalpy from p, s, and X or Xi"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input MassFraction X[:] "Mass fractions";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy(setState_psX(p, s, X, phase));
        end specificEnthalpy_psX;

        redeclare replaceable function density_ph "Return density from p and h"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Density d "Density";
        algorithm
          d := density_phX(p, h, fill(0.0, 0), phase);
        end density_ph;

        redeclare replaceable function temperature_ph "Return temperature from p and h"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Temperature T "Temperature";
        algorithm
          T := temperature_phX(p, h, fill(0.0, 0), phase);
        end temperature_ph;

        redeclare replaceable function pressure_dT "Return pressure from d and T"
          extends Modelica.Icons.Function;
          input Density d "Density";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output AbsolutePressure p "Pressure";
        algorithm
          p := pressure(setState_dTX(d, T, fill(0.0, 0), phase));
        end pressure_dT;

        redeclare replaceable function specificEnthalpy_dT "Return specific enthalpy from d and T"
          extends Modelica.Icons.Function;
          input Density d "Density";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy(setState_dTX(d, T, fill(0.0, 0), phase));
        end specificEnthalpy_dT;

        redeclare replaceable function specificEnthalpy_ps "Return specific enthalpy from p and s"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy_psX(p, s, fill(0.0, 0));
        end specificEnthalpy_ps;

        redeclare replaceable function temperature_ps "Return temperature from p and s"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Temperature T "Temperature";
        algorithm
          T := temperature_psX(p, s, fill(0.0, 0), phase);
        end temperature_ps;

        redeclare replaceable function density_ps "Return density from p and s"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Density d "Density";
        algorithm
          d := density_psX(p, s, fill(0.0, 0), phase);
        end density_ps;

        redeclare replaceable function specificEnthalpy_pT "Return specific enthalpy from p and T"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := specificEnthalpy_pTX(p, T, fill(0.0, 0), phase);
        end specificEnthalpy_pT;

        redeclare replaceable function density_pT "Return density from p and T"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          output Density d "Density";
        algorithm
          d := density(setState_pTX(p, T, fill(0.0, 0), phase));
        end density_pT;
      end PartialTwoPhaseMedium;

      package Choices "Types, constants to define menu choices"
        extends Modelica.Icons.Package;
        type IndependentVariables = enumeration(T "Temperature", pT "Pressure, Temperature", ph "Pressure, Specific Enthalpy", phX "Pressure, Specific Enthalpy, Mass Fraction", pTX "Pressure, Temperature, Mass Fractions", dTX "Density, Temperature, Mass Fractions") "Enumeration defining the independent variables of a medium";
      end Choices;

      package Types "Types to be used in fluid models"
        extends Modelica.Icons.Package;
        type AbsolutePressure = SI.AbsolutePressure(min = 0, max = 1.e8, nominal = 1.e5, start = 1.e5) "Type for absolute pressure with medium specific attributes";
        type Density = SI.Density(min = 0, max = 1.e5, nominal = 1, start = 1) "Type for density with medium specific attributes";
        type DynamicViscosity = SI.DynamicViscosity(min = 0, max = 1.e8, nominal = 1.e-3, start = 1.e-3) "Type for dynamic viscosity with medium specific attributes";
        type MassFraction = Real(quantity = "MassFraction", final unit = "kg/kg", min = 0, max = 1, nominal = 0.1) "Type for mass fraction with medium specific attributes";
        type MolarMass = SI.MolarMass(min = 0.001, max = 0.25, nominal = 0.032) "Type for molar mass with medium specific attributes";
        type MolarVolume = SI.MolarVolume(min = 1e-6, max = 1.0e6, nominal = 1.0) "Type for molar volume with medium specific attributes";
        type IsentropicExponent = SI.RatioOfSpecificHeatCapacities(min = 1, max = 500000, nominal = 1.2, start = 1.2) "Type for isentropic exponent with medium specific attributes";
        type SpecificEnergy = SI.SpecificEnergy(min = -1.0e8, max = 1.e8, nominal = 1.e6) "Type for specific energy with medium specific attributes";
        type SpecificInternalEnergy = SpecificEnergy "Type for specific internal energy with medium specific attributes";
        type SpecificEnthalpy = SI.SpecificEnthalpy(min = -1.0e10, max = 1.e10, nominal = 1.e6) "Type for specific enthalpy with medium specific attributes";
        type SpecificEntropy = SI.SpecificEntropy(min = -1.e7, max = 1.e7, nominal = 1.e3) "Type for specific entropy with medium specific attributes";
        type SpecificHeatCapacity = SI.SpecificHeatCapacity(min = 0, max = 1.e7, nominal = 1.e3, start = 1.e3) "Type for specific heat capacity with medium specific attributes";
        type SurfaceTension = SI.SurfaceTension "Type for surface tension with medium specific attributes";
        type Temperature = SI.Temperature(min = 1, max = 1.e4, nominal = 300, start = 288.15) "Type for temperature with medium specific attributes";
        type ThermalConductivity = SI.ThermalConductivity(min = 0, max = 500, nominal = 1, start = 1) "Type for thermal conductivity with medium specific attributes";
        type VelocityOfSound = SI.Velocity(min = 0, max = 1.e5, nominal = 1000, start = 1000) "Type for velocity of sound with medium specific attributes";
        type ExtraProperty = Real(min = 0.0, start = 1.0) "Type for unspecified, mass-specific property transported by flow";
        type IsobaricExpansionCoefficient = Real(min = 0, max = 1.0e8, unit = "1/K") "Type for isobaric expansion coefficient with medium specific attributes";
        type DipoleMoment = Real(min = 0.0, max = 2.0, unit = "debye", quantity = "ElectricDipoleMoment") "Type for dipole moment with medium specific attributes";
        type DerDensityByPressure = SI.DerDensityByPressure "Type for partial derivative of density with respect to pressure with medium specific attributes";
        type DerDensityByEnthalpy = SI.DerDensityByEnthalpy "Type for partial derivative of density with respect to enthalpy with medium specific attributes";
        type DerEnthalpyByPressure = SI.DerEnthalpyByPressure "Type for partial derivative of enthalpy with respect to pressure with medium specific attributes";
        type DerTemperatureByPressure = Real(final unit = "K/Pa") "Type for partial derivative of temperature with respect to pressure with medium specific attributes";

        replaceable record SaturationProperties "Saturation properties of two phase medium"
          extends Modelica.Icons.Record;
          AbsolutePressure psat "Saturation pressure";
          Temperature Tsat "Saturation temperature";
        end SaturationProperties;

        type FixedPhase = Integer(min = 0, max = 2) "Phase of the fluid: 1 for 1-phase, 2 for two-phase, 0 for not known, e.g., interactive use";

        package Basic "The most basic version of a record used in several degrees of detail"
          extends Icons.Package;

          record FluidConstants "Critical, triple, molecular and other standard data of fluid"
            extends Modelica.Icons.Record;
            String iupacName "Complete IUPAC name (or common name, if non-existent)";
            String casRegistryNumber "Chemical abstracts sequencing number (if it exists)";
            String chemicalFormula "Chemical formula, (brutto, nomenclature according to Hill";
            String structureFormula "Chemical structure formula";
            MolarMass molarMass "Molar mass";
          end FluidConstants;
        end Basic;

        package TwoPhase "The two phase fluid version of a record used in several degrees of detail"
          extends Icons.Package;

          record FluidConstants "Extended fluid constants"
            extends Modelica.Media.Interfaces.Types.Basic.FluidConstants;
            Temperature criticalTemperature "Critical temperature";
            AbsolutePressure criticalPressure "Critical pressure";
            MolarVolume criticalMolarVolume "Critical molar Volume";
            Real acentricFactor "Pitzer acentric factor";
            Temperature triplePointTemperature "Triple point temperature";
            AbsolutePressure triplePointPressure "Triple point pressure";
            Temperature meltingPoint "Melting point at 101325 Pa";
            Temperature normalBoilingPoint "Normal boiling point (at 101325 Pa)";
            DipoleMoment dipoleMoment "Dipole moment of molecule in Debye (1 debye = 3.33564e-30 C.m)";
            Boolean hasIdealGasHeatCapacity = false "= true, if ideal gas heat capacity is available";
            Boolean hasCriticalData = false "= true, if critical data are known";
            Boolean hasDipoleMoment = false "= true, if a dipole moment known";
            Boolean hasFundamentalEquation = false "= true, if a fundamental equation";
            Boolean hasLiquidHeatCapacity = false "= true, if liquid heat capacity is available";
            Boolean hasSolidHeatCapacity = false "= true, if solid heat capacity is available";
            Boolean hasAccurateViscosityData = false "= true, if accurate data for a viscosity function is available";
            Boolean hasAccurateConductivityData = false "= true, if accurate data for thermal conductivity is available";
            Boolean hasVapourPressureCurve = false "= true, if vapour pressure data, e.g., Antoine coefficients are known";
            Boolean hasAcentricFactor = false "= true, if Pitzer acentric factor is known";
            SpecificEnthalpy HCRIT0 = 0.0 "Critical specific enthalpy of the fundamental equation";
            SpecificEntropy SCRIT0 = 0.0 "Critical specific entropy of the fundamental equation";
            SpecificEnthalpy deltah = 0.0 "Difference between specific enthalpy model (h_m) and f.eq. (h_f) (h_m - h_f)";
            SpecificEntropy deltas = 0.0 "Difference between specific enthalpy model (s_m) and f.eq. (s_f) (s_m - s_f)";
          end FluidConstants;
        end TwoPhase;
      end Types;
    end Interfaces;

    package Common "Data structures and fundamental functions for fluid properties"
      extends Modelica.Icons.Package;
      type DerPressureByDensity = Real(final quantity = "DerPressureByDensity", final unit = "Pa.m3/kg");
      type DerPressureByTemperature = Real(final quantity = "DerPressureByTemperature", final unit = "Pa/K");
      constant Real MINPOS = 1.0e-9 "Minimal value for physical variables which are always > 0.0";

      record IF97BaseTwoPhase "Intermediate property data record for IF 97"
        extends Modelica.Icons.Record;
        Integer phase(start = 0) "Phase: 2 for two-phase, 1 for one phase, 0 if unknown";
        Integer region(min = 1, max = 5) "IF 97 region";
        SI.Pressure p "Pressure";
        SI.Temperature T "Temperature";
        SI.SpecificEnthalpy h "Specific enthalpy";
        SI.SpecificHeatCapacity R_s "Gas constant";
        SI.SpecificHeatCapacity cp "Specific heat capacity";
        SI.SpecificHeatCapacity cv "Specific heat capacity";
        SI.Density rho "Density";
        SI.SpecificEntropy s "Specific entropy";
        DerPressureByTemperature pt "Derivative of pressure w.r.t. temperature";
        DerPressureByDensity pd "Derivative of pressure w.r.t. density";
        Real vt "Derivative of specific volume w.r.t. temperature";
        Real vp "Derivative of specific volume w.r.t. pressure";
        Real x "Dryness fraction";
        Real dpT "dp/dT derivative of saturation curve";
      end IF97BaseTwoPhase;

      record IF97PhaseBoundaryProperties "Thermodynamic base properties on the phase boundary for IF97 steam tables"
        extends Modelica.Icons.Record;
        Boolean region3boundary "= true, if boundary between 2-phase and region 3";
        SI.SpecificHeatCapacity R_s "Specific heat capacity";
        SI.Temperature T "Temperature";
        SI.Density d "Density";
        SI.SpecificEnthalpy h "Specific enthalpy";
        SI.SpecificEntropy s "Specific entropy";
        SI.SpecificHeatCapacity cp "Heat capacity at constant pressure";
        SI.SpecificHeatCapacity cv "Heat capacity at constant volume";
        DerPressureByTemperature dpT "dp/dT derivative of saturation curve";
        DerPressureByTemperature pt "Derivative of pressure w.r.t. temperature";
        DerPressureByDensity pd "Derivative of pressure w.r.t. density";
        Real vt(unit = "m3/(kg.K)") "Derivative of specific volume w.r.t. temperature";
        Real vp(unit = "m3/(kg.Pa)") "Derivative of specific volume w.r.t. pressure";
      end IF97PhaseBoundaryProperties;

      record GibbsDerivs "Derivatives of dimensionless Gibbs-function w.r.t. dimensionless pressure and temperature"
        extends Modelica.Icons.Record;
        SI.Pressure p "Pressure";
        SI.Temperature T "Temperature";
        SI.SpecificHeatCapacity R_s "Specific heat capacity";
        Real pi(unit = "1") "Dimensionless pressure";
        Real tau(unit = "1") "Dimensionless temperature";
        Real g(unit = "1") "Dimensionless Gibbs-function";
        Real gpi(unit = "1") "Derivative of g w.r.t. pi";
        Real gpipi(unit = "1") "2nd derivative of g w.r.t. pi";
        Real gtau(unit = "1") "Derivative of g w.r.t. tau";
        Real gtautau(unit = "1") "2nd derivative of g w.r.t. tau";
        Real gtaupi(unit = "1") "Mixed derivative of g w.r.t. pi and tau";
      end GibbsDerivs;

      record HelmholtzDerivs "Derivatives of dimensionless Helmholtz-function w.r.t. dimensionless pressure, density and temperature"
        extends Modelica.Icons.Record;
        SI.Density d "Density";
        SI.Temperature T "Temperature";
        SI.SpecificHeatCapacity R_s "Specific heat capacity";
        Real delta(unit = "1") "Dimensionless density";
        Real tau(unit = "1") "Dimensionless temperature";
        Real f(unit = "1") "Dimensionless Helmholtz-function";
        Real fdelta(unit = "1") "Derivative of f w.r.t. delta";
        Real fdeltadelta(unit = "1") "2nd derivative of f w.r.t. delta";
        Real ftau(unit = "1") "Derivative of f w.r.t. tau";
        Real ftautau(unit = "1") "2nd derivative of f w.r.t. tau";
        Real fdeltatau(unit = "1") "Mixed derivative of f w.r.t. delta and tau";
      end HelmholtzDerivs;

      record PhaseBoundaryProperties "Thermodynamic base properties on the phase boundary"
        extends Modelica.Icons.Record;
        SI.Density d "Density";
        SI.SpecificEnthalpy h "Specific enthalpy";
        SI.SpecificEnergy u "Inner energy";
        SI.SpecificEntropy s "Specific entropy";
        SI.SpecificHeatCapacity cp "Heat capacity at constant pressure";
        SI.SpecificHeatCapacity cv "Heat capacity at constant volume";
        DerPressureByTemperature pt "Derivative of pressure w.r.t. temperature";
        DerPressureByDensity pd "Derivative of pressure w.r.t. density";
      end PhaseBoundaryProperties;

      record NewtonDerivatives_ph "Derivatives for fast inverse calculations of Helmholtz functions: p & h"
        extends Modelica.Icons.Record;
        SI.Pressure p "Pressure";
        SI.SpecificEnthalpy h "Specific enthalpy";
        DerPressureByDensity pd "Derivative of pressure w.r.t. density";
        DerPressureByTemperature pt "Derivative of pressure w.r.t. temperature";
        Real hd "Derivative of specific enthalpy w.r.t. density";
        Real ht "Derivative of specific enthalpy w.r.t. temperature";
      end NewtonDerivatives_ph;

      record NewtonDerivatives_ps "Derivatives for fast inverse calculation of Helmholtz functions: p & s"
        extends Modelica.Icons.Record;
        SI.Pressure p "Pressure";
        SI.SpecificEntropy s "Specific entropy";
        DerPressureByDensity pd "Derivative of pressure w.r.t. density";
        DerPressureByTemperature pt "Derivative of pressure w.r.t. temperature";
        Real sd "Derivative of specific entropy w.r.t. density";
        Real st "Derivative of specific entropy w.r.t. temperature";
      end NewtonDerivatives_ps;

      record NewtonDerivatives_pT "Derivatives for fast inverse calculations of Helmholtz functions:p & T"
        extends Modelica.Icons.Record;
        SI.Pressure p "Pressure";
        DerPressureByDensity pd "Derivative of pressure w.r.t. density";
      end NewtonDerivatives_pT;

      function gibbsToBoundaryProps "Calculate phase boundary property record from dimensionless Gibbs function"
        extends Modelica.Icons.Function;
        input GibbsDerivs g "Dimensionless derivatives of Gibbs function";
        output PhaseBoundaryProperties sat "Phase boundary properties";
      protected
        Real vt "Derivative of specific volume w.r.t. temperature";
        Real vp "Derivative of specific volume w.r.t. pressure";
      algorithm
        sat.d := g.p/(g.R_s*g.T*g.pi*g.gpi);
        sat.h := g.R_s*g.T*g.tau*g.gtau;
        sat.u := g.T*g.R_s*(g.tau*g.gtau - g.pi*g.gpi);
        sat.s := g.R_s*(g.tau*g.gtau - g.g);
        sat.cp := -g.R_s*g.tau*g.tau*g.gtautau;
        sat.cv := g.R_s*(-g.tau*g.tau*g.gtautau + (g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/(g.gpipi));
        vt := g.R_s/g.p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
        vp := g.R_s*g.T/(g.p*g.p)*g.pi*g.pi*g.gpipi;
        sat.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
        sat.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
      end gibbsToBoundaryProps;

      function helmholtzToBoundaryProps "Calculate phase boundary property record from dimensionless Helmholtz function"
        extends Modelica.Icons.Function;
        input HelmholtzDerivs f "Dimensionless derivatives of Helmholtz function";
        output PhaseBoundaryProperties sat "Phase boundary property record";
      protected
        SI.Pressure p "Pressure";
      algorithm
        p := f.R_s*f.d*f.T*f.delta*f.fdelta;
        sat.d := f.d;
        sat.h := f.R_s*f.T*(f.tau*f.ftau + f.delta*f.fdelta);
        sat.s := f.R_s*(f.tau*f.ftau - f.f);
        sat.u := f.R_s*f.T*f.tau*f.ftau;
        sat.cp := f.R_s*(-f.tau*f.tau*f.ftautau + (f.delta*f.fdelta - f.delta*f.tau*f.fdeltatau)^2/(2*f.delta*f.fdelta + f.delta*f.delta*f.fdeltadelta));
        sat.cv := f.R_s*(-f.tau*f.tau*f.ftautau);
        sat.pt := f.R_s*f.d*f.delta*(f.fdelta - f.tau*f.fdeltatau);
        sat.pd := f.R_s*f.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
      end helmholtzToBoundaryProps;

      function cv2Phase "Compute isochoric specific heat capacity inside the two-phase region"
        extends Modelica.Icons.Function;
        input PhaseBoundaryProperties liq "Properties on the boiling curve";
        input PhaseBoundaryProperties vap "Properties on the condensation curve";
        input SI.MassFraction x "Vapour mass fraction";
        input SI.Temperature T "Temperature";
        input SI.Pressure p "Properties";
        output SI.SpecificHeatCapacity cv "Isochoric specific heat capacity";
      protected
        Real dpT "Derivative of pressure w.r.t. temperature";
        Real dxv "Derivative of vapour mass fraction w.r.t. specific volume";
        Real dvTl "Derivative of liquid specific volume w.r.t. temperature";
        Real dvTv "Derivative of vapour specific volume w.r.t. temperature";
        Real duTl "Derivative of liquid specific inner energy w.r.t. temperature";
        Real duTv "Derivative of vapour specific inner energy w.r.t. temperature";
        Real dxt "Derivative of vapour mass fraction w.r.t. temperature";
      algorithm
        dxv := if (liq.d <> vap.d) then liq.d*vap.d/(liq.d - vap.d) else 0.0;
        dpT := (vap.s - liq.s)*dxv;
        dvTl := (liq.pt - dpT)/liq.pd/liq.d/liq.d;
        dvTv := (vap.pt - dpT)/vap.pd/vap.d/vap.d;
        dxt := -dxv*(dvTl + x*(dvTv - dvTl));
        duTl := liq.cv + (T*liq.pt - p)*dvTl;
        duTv := vap.cv + (T*vap.pt - p)*dvTv;
        cv := duTl + x*(duTv - duTl) + dxt*(vap.u - liq.u);
      end cv2Phase;

      function Helmholtz_ph "Function to calculate analytic derivatives for computing d and t given p and h"
        extends Modelica.Icons.Function;
        input HelmholtzDerivs f "Dimensionless derivatives of Helmholtz function";
        output NewtonDerivatives_ph nderivs "Derivatives for Newton iteration to calculate d and t from p and h";
      protected
        SI.SpecificHeatCapacity cv "Isochoric heat capacity";
      algorithm
        cv := -f.R_s*(f.tau*f.tau*f.ftautau);
        nderivs.p := f.d*f.R_s*f.T*f.delta*f.fdelta;
        nderivs.h := f.R_s*f.T*(f.tau*f.ftau + f.delta*f.fdelta);
        nderivs.pd := f.R_s*f.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
        nderivs.pt := f.R_s*f.d*f.delta*(f.fdelta - f.tau*f.fdeltatau);
        nderivs.ht := cv + nderivs.pt/f.d;
        nderivs.hd := (nderivs.pd - f.T*nderivs.pt/f.d)/f.d;
      end Helmholtz_ph;

      function Helmholtz_pT "Function to calculate analytic derivatives for computing d and t given p and t"
        extends Modelica.Icons.Function;
        input HelmholtzDerivs f "Dimensionless derivatives of Helmholtz function";
        output NewtonDerivatives_pT nderivs "Derivatives for Newton iteration to compute d and t from p and t";
      algorithm
        nderivs.p := f.d*f.R_s*f.T*f.delta*f.fdelta;
        nderivs.pd := f.R_s*f.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
      end Helmholtz_pT;

      function Helmholtz_ps "Function to calculate analytic derivatives for computing d and t given p and s"
        extends Modelica.Icons.Function;
        input HelmholtzDerivs f "Dimensionless derivatives of Helmholtz function";
        output NewtonDerivatives_ps nderivs "Derivatives for Newton iteration to compute d and t from p and s";
      protected
        SI.SpecificHeatCapacity cv "Isochoric heat capacity";
      algorithm
        cv := -f.R_s*(f.tau*f.tau*f.ftautau);
        nderivs.p := f.d*f.R_s*f.T*f.delta*f.fdelta;
        nderivs.s := f.R_s*(f.tau*f.ftau - f.f);
        nderivs.pd := f.R_s*f.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
        nderivs.pt := f.R_s*f.d*f.delta*(f.fdelta - f.tau*f.fdeltatau);
        nderivs.st := cv/f.T;
        nderivs.sd := -nderivs.pt/(f.d*f.d);
      end Helmholtz_ps;

      function smoothStep "Approximation of a general step, such that the characteristic is continuous and differentiable"
        extends Modelica.Icons.Function;
        input Real x "Abscissa value";
        input Real y1 "Ordinate value for x > 0";
        input Real y2 "Ordinate value for x < 0";
        input Real x_small(min = 0) = 1e-5 "Approximation of step for -x_small <= x <= x_small; x_small > 0 required";
        output Real y "Ordinate value to approximate y = if x > 0 then y1 else y2";
      algorithm
        y := smooth(1, if x > x_small then y1 else if x < -x_small then y2 else if abs(x_small) > 0 then (x/x_small)*((x/x_small)^2 - 3)*(y2 - y1)/4 + (y1 + y2)/2 else (y1 + y2)/2);
        annotation(Inline = true, smoothOrder = 1);
      end smoothStep;
    end Common;

    package Water "Medium models for water"
      extends Modelica.Icons.VariantsPackage;
      import Modelica.Media.Water.ConstantPropertyLiquidWater.simpleWaterConstants;
      constant Modelica.Media.Interfaces.Types.TwoPhase.FluidConstants waterConstants[1](each chemicalFormula = "H2O", each structureFormula = "H2O", each casRegistryNumber = "7732-18-5", each iupacName = "oxidane", each molarMass = 0.018015268, each criticalTemperature = 647.096, each criticalPressure = 22064.0e3, each criticalMolarVolume = 1/322.0*0.018015268, each normalBoilingPoint = 373.124, each meltingPoint = 273.15, each triplePointTemperature = 273.16, each triplePointPressure = 611.657, each acentricFactor = 0.344, each dipoleMoment = 1.8, each hasCriticalData = true);
      package StandardWater = WaterIF97_ph "Water using the IF97 standard, explicit in p and h. Recommended for most applications";
      package StandardWaterOnePhase = WaterIF97_pT "Water using the IF97 standard, explicit in p and T. Recommended for one-phase applications";

      package WaterIF97_pT "Water using the IF97 standard, explicit in p and T"
        extends WaterIF97_base(ThermoStates = Modelica.Media.Interfaces.Choices.IndependentVariables.pT, final ph_explicit = false, final dT_explicit = false, final pT_explicit = true, final smoothModel = true, final onePhase = true);
      end WaterIF97_pT;

      package WaterIF97_ph "Water using the IF97 standard, explicit in p and h"
        extends WaterIF97_base(ThermoStates = Modelica.Media.Interfaces.Choices.IndependentVariables.ph, final ph_explicit = true, final dT_explicit = false, final pT_explicit = false, smoothModel = false, onePhase = false);
      end WaterIF97_ph;

      partial package WaterIF97_base "Water: Steam properties as defined by IAPWS/IF97 standard"
        extends Interfaces.PartialTwoPhaseMedium(mediumName = "WaterIF97", substanceNames = {"water"}, singleState = false, SpecificEnthalpy(start = 1.0e5, nominal = 5.0e5), Density(start = 150, nominal = 500), AbsolutePressure(start = 50e5, nominal = 10e5, min = 611.657, max = 100e6), Temperature(start = 500, nominal = 500, min = 273.15, max = 2273.15), smoothModel = false, onePhase = false, fluidConstants = waterConstants);

        redeclare record extends SaturationProperties end SaturationProperties;

        redeclare record extends ThermodynamicState "Thermodynamic state"
          SpecificEnthalpy h "Specific enthalpy";
          Density d "Density";
          Temperature T "Temperature";
          AbsolutePressure p "Pressure";
        end ThermodynamicState;

        constant Integer Region = 0 "Region of IF97, if known, zero otherwise";
        constant Boolean ph_explicit "True if explicit in pressure and specific enthalpy";
        constant Boolean dT_explicit "True if explicit in density and temperature";
        constant Boolean pT_explicit "True if explicit in pressure and temperature";

        redeclare replaceable model extends BaseProperties(h(stateSelect = if ph_explicit and preferredMediumStates then StateSelect.prefer else StateSelect.default), d(stateSelect = if dT_explicit and preferredMediumStates then StateSelect.prefer else StateSelect.default), T(stateSelect = if (pT_explicit or dT_explicit) and preferredMediumStates then StateSelect.prefer else StateSelect.default), p(stateSelect = if (pT_explicit or ph_explicit) and preferredMediumStates then StateSelect.prefer else StateSelect.default)) "Base properties of water"
          Integer phase(min = 0, max = 2, start = 1, fixed = false) "2 for two-phase, 1 for one-phase, 0 if not known";
        equation
          MM = fluidConstants[1].molarMass;
          if Region > 0 then
            phase = (if Region == 4 then 2 else 1);
          elseif smoothModel then
            if onePhase then
              phase = 1;
              if ph_explicit then
                assert(((h < bubbleEnthalpy(sat) or h > dewEnthalpy(sat)) or p > fluidConstants[1].criticalPressure), "With onePhase=true this model may only be called with one-phase states h < hl or h > hv!" + "(p = " + String(p) + ", h = " + String(h) + ")");
              else
                if dT_explicit then
                  assert(not ((d < bubbleDensity(sat) and d > dewDensity(sat)) and T < fluidConstants[1].criticalTemperature), "With onePhase=true this model may only be called with one-phase states d > dl or d < dv!" + "(d = " + String(d) + ", T = " + String(T) + ")");
                end if;
              end if;
            else
              phase = 0;
            end if;
          else
            if ph_explicit then
              phase = if ((h < bubbleEnthalpy(sat) or h > dewEnthalpy(sat)) or p > fluidConstants[1].criticalPressure) then 1 else 2;
            elseif dT_explicit then
              phase = if not ((d < bubbleDensity(sat) and d > dewDensity(sat)) and T < fluidConstants[1].criticalTemperature) then 1 else 2;
            else
              phase = 1;
            end if;
          end if;
          if dT_explicit then
            p = pressure_dT(d, T, phase, Region);
            h = specificEnthalpy_dT(d, T, phase, Region);
            sat.Tsat = T;
            sat.psat = saturationPressure(T);
          elseif ph_explicit then
            d = density_ph(p, h, phase, Region);
            T = temperature_ph(p, h, phase, Region);
            sat.Tsat = saturationTemperature(p);
            sat.psat = p;
          else
            h = specificEnthalpy_pT(p, T, Region);
            d = density_pT(p, T, Region);
            sat.psat = p;
            sat.Tsat = saturationTemperature(p);
          end if;
          u = h - p/d;
          R_s = Modelica.Constants.R/fluidConstants[1].molarMass;
          h = state.h;
          p = state.p;
          T = state.T;
          d = state.d;
          phase = state.phase;
        end BaseProperties;

        redeclare function density_ph "Computes density as a function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output Density d "Density";
        algorithm
          d := IF97_Utilities.rho_ph(p, h, phase, region);
          annotation(Inline = true);
        end density_ph;

        redeclare function temperature_ph "Computes temperature as a function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEnthalpy h "Specific enthalpy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output Temperature T "Temperature";
        algorithm
          T := IF97_Utilities.T_ph(p, h, phase, region);
          annotation(Inline = true);
        end temperature_ph;

        redeclare function temperature_ps "Compute temperature from pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output Temperature T "Temperature";
        algorithm
          T := IF97_Utilities.T_ps(p, s, phase, region);
          annotation(Inline = true);
        end temperature_ps;

        redeclare function density_ps "Computes density as a function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output Density d "Density";
        algorithm
          d := IF97_Utilities.rho_ps(p, s, phase, region);
          annotation(Inline = true);
        end density_ps;

        redeclare function pressure_dT "Computes pressure as a function of density and temperature"
          extends Modelica.Icons.Function;
          input Density d "Density";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output AbsolutePressure p "Pressure";
        algorithm
          p := IF97_Utilities.p_dT(d, T, phase, region);
          annotation(Inline = true);
        end pressure_dT;

        redeclare function specificEnthalpy_dT "Computes specific enthalpy as a function of density and temperature"
          extends Modelica.Icons.Function;
          input Density d "Density";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := IF97_Utilities.h_dT(d, T, phase, region);
          annotation(Inline = true);
        end specificEnthalpy_dT;

        redeclare function specificEnthalpy_pT "Computes specific enthalpy as a function of pressure and temperature"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := IF97_Utilities.h_pT(p, T, region);
          annotation(Inline = true);
        end specificEnthalpy_pT;

        redeclare function specificEnthalpy_ps "Computes specific enthalpy as a function of pressure and temperature"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input SpecificEntropy s "Specific entropy";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := IF97_Utilities.h_ps(p, s, phase, region);
          annotation(Inline = true);
        end specificEnthalpy_ps;

        redeclare function density_pT "Computes density as a function of pressure and temperature"
          extends Modelica.Icons.Function;
          input AbsolutePressure p "Pressure";
          input Temperature T "Temperature";
          input FixedPhase phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
          output Density d "Density";
        algorithm
          d := IF97_Utilities.rho_pT(p, T, region);
          annotation(Inline = true);
        end density_pT;

        redeclare function extends setDewState "Set the thermodynamic state on the dew line"
        algorithm
          state := ThermodynamicState(phase = phase, p = sat.psat, T = sat.Tsat, h = dewEnthalpy(sat), d = dewDensity(sat));
          annotation(Inline = true);
        end setDewState;

        redeclare function extends setBubbleState "Set the thermodynamic state on the bubble line"
        algorithm
          state := ThermodynamicState(phase = phase, p = sat.psat, T = sat.Tsat, h = bubbleEnthalpy(sat), d = bubbleDensity(sat));
          annotation(Inline = true);
        end setBubbleState;

        redeclare function extends dynamicViscosity "Dynamic viscosity of water"
        algorithm
          eta := IF97_Utilities.dynamicViscosity(state.d, state.T, state.p, state.phase);
          annotation(Inline = true);
        end dynamicViscosity;

        redeclare function extends thermalConductivity "Thermal conductivity of water"
        algorithm
          lambda := IF97_Utilities.thermalConductivity(state.d, state.T, state.p, state.phase);
          annotation(Inline = true);
        end thermalConductivity;

        redeclare function extends surfaceTension "Surface tension in two phase region of water"
        algorithm
          sigma := IF97_Utilities.surfaceTension(sat.Tsat);
          annotation(Inline = true);
        end surfaceTension;

        redeclare function extends pressure "Return pressure of ideal gas"
        algorithm
          p := state.p;
          annotation(Inline = true);
        end pressure;

        redeclare function extends temperature "Return temperature of ideal gas"
        algorithm
          T := state.T;
          annotation(Inline = true);
        end temperature;

        redeclare function extends density "Return density of ideal gas"
        algorithm
          d := state.d;
          annotation(Inline = true);
        end density;

        redeclare function extends specificEnthalpy "Return specific enthalpy"
          extends Modelica.Icons.Function;
        algorithm
          h := state.h;
          annotation(Inline = true);
        end specificEnthalpy;

        redeclare function extends specificInternalEnergy "Return specific internal energy"
          extends Modelica.Icons.Function;
        algorithm
          u := state.h - state.p/state.d;
          annotation(Inline = true);
        end specificInternalEnergy;

        redeclare function extends specificGibbsEnergy "Return specific Gibbs energy"
          extends Modelica.Icons.Function;
        algorithm
          g := state.h - state.T*specificEntropy(state);
          annotation(Inline = true);
        end specificGibbsEnergy;

        redeclare function extends specificHelmholtzEnergy "Return specific Helmholtz energy"
          extends Modelica.Icons.Function;
        algorithm
          f := state.h - state.p/state.d - state.T*specificEntropy(state);
          annotation(Inline = true);
        end specificHelmholtzEnergy;

        redeclare function extends specificEntropy "Specific entropy of water"
        algorithm
          s := if dT_explicit then IF97_Utilities.s_dT(state.d, state.T, state.phase, Region) else if pT_explicit then IF97_Utilities.s_pT(state.p, state.T, Region) else IF97_Utilities.s_ph(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end specificEntropy;

        redeclare function extends specificHeatCapacityCp "Specific heat capacity at constant pressure of water"
        algorithm
          cp := if dT_explicit then IF97_Utilities.cp_dT(state.d, state.T, Region) else if pT_explicit then IF97_Utilities.cp_pT(state.p, state.T, Region) else IF97_Utilities.cp_ph(state.p, state.h, Region);
          annotation(Inline = true);
        end specificHeatCapacityCp;

        redeclare function extends specificHeatCapacityCv "Specific heat capacity at constant volume of water"
        algorithm
          cv := if dT_explicit then IF97_Utilities.cv_dT(state.d, state.T, state.phase, Region) else if pT_explicit then IF97_Utilities.cv_pT(state.p, state.T, Region) else IF97_Utilities.cv_ph(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end specificHeatCapacityCv;

        redeclare function extends isentropicExponent "Return isentropic exponent"
        algorithm
          gamma := if dT_explicit then IF97_Utilities.isentropicExponent_dT(state.d, state.T, state.phase, Region) else if pT_explicit then IF97_Utilities.isentropicExponent_pT(state.p, state.T, Region) else IF97_Utilities.isentropicExponent_ph(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end isentropicExponent;

        redeclare function extends isothermalCompressibility "Isothermal compressibility of water"
        algorithm
          kappa := if dT_explicit then IF97_Utilities.kappa_dT(state.d, state.T, state.phase, Region) else if pT_explicit then IF97_Utilities.kappa_pT(state.p, state.T, Region) else IF97_Utilities.kappa_ph(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end isothermalCompressibility;

        redeclare function extends isobaricExpansionCoefficient "Isobaric expansion coefficient of water"
        algorithm
          beta := if dT_explicit then IF97_Utilities.beta_dT(state.d, state.T, state.phase, Region) else if pT_explicit then IF97_Utilities.beta_pT(state.p, state.T, Region) else IF97_Utilities.beta_ph(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end isobaricExpansionCoefficient;

        redeclare function extends velocityOfSound "Return velocity of sound as a function of the thermodynamic state record"
        algorithm
          a := if dT_explicit then IF97_Utilities.velocityOfSound_dT(state.d, state.T, state.phase, Region) else if pT_explicit then IF97_Utilities.velocityOfSound_pT(state.p, state.T, Region) else IF97_Utilities.velocityOfSound_ph(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end velocityOfSound;

        redeclare function extends isentropicEnthalpy "Compute h(s,p)"
        algorithm
          h_is := IF97_Utilities.isentropicEnthalpy(p_downstream, specificEntropy(refState), 0);
          annotation(Inline = true);
        end isentropicEnthalpy;

        redeclare function extends density_derh_p "Density derivative by specific enthalpy"
        algorithm
          ddhp := IF97_Utilities.ddhp(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end density_derh_p;

        redeclare function extends density_derp_h "Density derivative by pressure"
        algorithm
          ddph := IF97_Utilities.ddph(state.p, state.h, state.phase, Region);
          annotation(Inline = true);
        end density_derp_h;

        redeclare function extends bubbleEnthalpy "Boiling curve specific enthalpy of water"
        algorithm
          hl := IF97_Utilities.BaseIF97.Regions.hl_p(sat.psat);
          annotation(Inline = true);
        end bubbleEnthalpy;

        redeclare function extends dewEnthalpy "Dew curve specific enthalpy of water"
        algorithm
          hv := IF97_Utilities.BaseIF97.Regions.hv_p(sat.psat);
          annotation(Inline = true);
        end dewEnthalpy;

        redeclare function extends bubbleEntropy "Boiling curve specific entropy of water"
        algorithm
          sl := IF97_Utilities.BaseIF97.Regions.sl_p(sat.psat);
          annotation(Inline = true);
        end bubbleEntropy;

        redeclare function extends dewEntropy "Dew curve specific entropy of water"
        algorithm
          sv := IF97_Utilities.BaseIF97.Regions.sv_p(sat.psat);
          annotation(Inline = true);
        end dewEntropy;

        redeclare function extends bubbleDensity "Boiling curve specific density of water"
        algorithm
          dl := if ph_explicit or pT_explicit then IF97_Utilities.BaseIF97.Regions.rhol_p(sat.psat) else IF97_Utilities.BaseIF97.Regions.rhol_T(sat.Tsat);
          annotation(Inline = true);
        end bubbleDensity;

        redeclare function extends dewDensity "Dew curve specific density of water"
        algorithm
          dv := if ph_explicit or pT_explicit then IF97_Utilities.BaseIF97.Regions.rhov_p(sat.psat) else IF97_Utilities.BaseIF97.Regions.rhov_T(sat.Tsat);
          annotation(Inline = true);
        end dewDensity;

        redeclare function extends saturationTemperature "Saturation temperature of water"
        algorithm
          T := IF97_Utilities.BaseIF97.Basic.tsat(p);
          annotation(Inline = true);
        end saturationTemperature;

        redeclare function extends saturationTemperature_derp "Derivative of saturation temperature w.r.t. pressure"
        algorithm
          dTp := IF97_Utilities.BaseIF97.Basic.dtsatofp(p);
          annotation(Inline = true);
        end saturationTemperature_derp;

        redeclare function extends saturationPressure "Saturation pressure of water"
        algorithm
          p := IF97_Utilities.BaseIF97.Basic.psat(T);
          annotation(Inline = true);
        end saturationPressure;

        redeclare function extends dBubbleDensity_dPressure "Bubble point density derivative"
        algorithm
          ddldp := IF97_Utilities.BaseIF97.Regions.drhol_dp(sat.psat);
          annotation(Inline = true);
        end dBubbleDensity_dPressure;

        redeclare function extends dDewDensity_dPressure "Dew point density derivative"
        algorithm
          ddvdp := IF97_Utilities.BaseIF97.Regions.drhov_dp(sat.psat);
          annotation(Inline = true);
        end dDewDensity_dPressure;

        redeclare function extends dBubbleEnthalpy_dPressure "Bubble point specific enthalpy derivative"
        algorithm
          dhldp := IF97_Utilities.BaseIF97.Regions.dhl_dp(sat.psat);
          annotation(Inline = true);
        end dBubbleEnthalpy_dPressure;

        redeclare function extends dDewEnthalpy_dPressure "Dew point specific enthalpy derivative"
        algorithm
          dhvdp := IF97_Utilities.BaseIF97.Regions.dhv_dp(sat.psat);
          annotation(Inline = true);
        end dDewEnthalpy_dPressure;

        redeclare function extends setState_dTX "Return thermodynamic state of water as function of d, T, and optional region"
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
        algorithm
          state := ThermodynamicState(d = d, T = T, phase = if region == 0 then 0 else if region == 4 then 2 else 1, h = specificEnthalpy_dT(d, T, region = region), p = pressure_dT(d, T, region = region));
          annotation(Inline = true);
        end setState_dTX;

        redeclare function extends setState_phX "Return thermodynamic state of water as function of p, h, and optional region"
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
        algorithm
          state := ThermodynamicState(d = density_ph(p, h, region = region), T = temperature_ph(p, h, region = region), phase = if region == 0 then 0 else if region == 4 then 2 else 1, h = h, p = p);
          annotation(Inline = true);
        end setState_phX;

        redeclare function extends setState_psX "Return thermodynamic state of water as function of p, s, and optional region"
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
        algorithm
          state := ThermodynamicState(d = density_ps(p, s, region = region), T = temperature_ps(p, s, region = region), phase = if region == 0 then 0 else if region == 4 then 2 else 1, h = specificEnthalpy_ps(p, s, region = region), p = p);
          annotation(Inline = true);
        end setState_psX;

        redeclare function extends setState_pTX "Return thermodynamic state of water as function of p, T, and optional region"
          input Integer region = Region "If 0, region is unknown, otherwise known and this input";
        algorithm
          state := ThermodynamicState(d = density_pT(p, T, region = region), T = T, phase = 1, h = specificEnthalpy_pT(p, T, region = region), p = p);
          annotation(Inline = true);
        end setState_pTX;

        redeclare function extends setSmoothState "Return thermodynamic state so that it smoothly approximates: if x > 0 then state_a else state_b"
          import Modelica.Media.Common.smoothStep;
        algorithm
          state := ThermodynamicState(p = smoothStep(x, state_a.p, state_b.p, x_small), h = smoothStep(x, state_a.h, state_b.h, x_small), d = density_ph(smoothStep(x, state_a.p, state_b.p, x_small), smoothStep(x, state_a.h, state_b.h, x_small)), T = temperature_ph(smoothStep(x, state_a.p, state_b.p, x_small), smoothStep(x, state_a.h, state_b.h, x_small)), phase = 0);
          annotation(Inline = true);
        end setSmoothState;
      end WaterIF97_base;

      package IF97_Utilities "Low level and utility computation for high accuracy water properties according to the IAPWS/IF97 standard"
        extends Modelica.Icons.UtilitiesPackage;

        package BaseIF97 "Modelica Physical Property Model: the new industrial formulation IAPWS-IF97"
          extends Modelica.Icons.Package;

          record IterationData "Constants for iterations internal to some functions"
            extends Modelica.Icons.Record;
            constant Integer IMAX = 50 "Maximum number of iterations for inverse functions";
            constant Real DELP = 1.0e-6 "Maximum iteration error in pressure, Pa";
            constant Real DELS = 1.0e-8 "Maximum iteration error in specific entropy, J/{kg.K}";
            constant Real DELH = 1.0e-8 "Maximum iteration error in specific enthalpy, J/kg";
            constant Real DELD = 1.0e-8 "Maximum iteration error in density, kg/m^3";
          end IterationData;

          record data "Constant IF97 data and region limits"
            extends Modelica.Icons.Record;
            constant SI.SpecificHeatCapacity RH2O = 461.526 "Specific gas constant of water vapour";
            constant SI.MolarMass MH2O = 0.01801528 "Molar weight of water";
            constant SI.Temperature TSTAR1 = 1386.0 "Normalization temperature for region 1 IF97";
            constant SI.Pressure PSTAR1 = 16.53e6 "Normalization pressure for region 1 IF97";
            constant SI.Temperature TSTAR2 = 540.0 "Normalization temperature for region 2 IF97";
            constant SI.Pressure PSTAR2 = 1.0e6 "Normalization pressure for region 2 IF97";
            constant SI.Temperature TSTAR5 = 1000.0 "Normalization temperature for region 5 IF97";
            constant SI.Pressure PSTAR5 = 1.0e6 "Normalization pressure for region 5 IF97";
            constant SI.SpecificEnthalpy HSTAR1 = 2.5e6 "Normalization specific enthalpy for region 1 IF97";
            constant Real IPSTAR = 1.0e-6 "Normalization pressure for inverse function in region 2 IF97";
            constant Real IHSTAR = 5.0e-7 "Normalization specific enthalpy for inverse function in region 2 IF97";
            constant SI.Temperature TLIMIT1 = 623.15 "Temperature limit between regions 1 and 3";
            constant SI.Temperature TLIMIT2 = 1073.15 "Temperature limit between regions 2 and 5";
            constant SI.Temperature TLIMIT5 = 2273.15 "Upper temperature limit of 5";
            constant SI.Pressure PLIMIT1 = 100.0e6 "Upper pressure limit for regions 1, 2 and 3";
            constant SI.Pressure PLIMIT4A = 16.5292e6 "Pressure limit between regions 1 and 2, important for two-phase (region 4)";
            constant SI.Pressure PLIMIT5 = 10.0e6 "Upper limit of valid pressure in region 5";
            constant SI.Pressure PCRIT = 22064000.0 "The critical pressure";
            constant SI.Temperature TCRIT = 647.096 "The critical temperature";
            constant SI.Density DCRIT = 322.0 "The critical density";
            constant SI.SpecificEntropy SCRIT = 4412.02148223476 "The calculated specific entropy at the critical point";
            constant SI.SpecificEnthalpy HCRIT = 2087546.84511715 "The calculated specific enthalpy at the critical point";
            constant Real n[5] = array(0.34805185628969e3, -0.11671859879975e1, 0.10192970039326e-2, 0.57254459862746e3, 0.13918839778870e2) "Polynomial coefficients for boundary between regions 2 and 3";
          end data;

          record triple "Triple point data"
            extends Modelica.Icons.Record;
            constant SI.Temperature Ttriple = 273.16 "The triple point temperature";
            constant SI.Pressure ptriple = 611.657 "The triple point pressure";
            constant SI.Density dltriple = 999.792520031617642 "The triple point liquid density";
            constant SI.Density dvtriple = 0.485457572477861372e-2 "The triple point vapour density";
          end triple;

          package Regions "Functions to find the current region for given pairs of input variables"
            extends Modelica.Icons.FunctionsPackage;

            function boundary23ofT "Boundary function for region boundary between regions 2 and 3 (input temperature)"
              extends Modelica.Icons.Function;
              input SI.Temperature t "Temperature (K)";
              output SI.Pressure p "Pressure";
            protected
              constant Real n[5] = data.n;
            algorithm
              p := 1.0e6*(n[1] + t*(n[2] + t*n[3]));
            end boundary23ofT;

            function boundary23ofp "Boundary function for region boundary between regions 2 and 3 (input pressure)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.Temperature t "Temperature (K)";
            protected
              constant Real n[5] = data.n;
              Real pi "Dimensionless pressure";
            algorithm
              pi := p/1.0e6;
              assert(p > triple.ptriple, "IF97 medium function boundary23ofp called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              t := n[4] + sqrt((pi - n[5])/n[3]);
            end boundary23ofp;

            function hlowerofp5 "Explicit lower specific enthalpy limit of region 5 as function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real pi "Dimensionless pressure";
            algorithm
              pi := p/data.PSTAR5;
              assert(p > triple.ptriple, "IF97 medium function hlowerofp5 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              h := 461526.*(9.01505286876203 + pi*(-0.00979043490246092 + (-0.0000203245575263501 + 3.36540214679088e-7*pi)*pi));
            end hlowerofp5;

            function hupperofp5 "Explicit upper specific enthalpy limit of region 5 as function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real pi "Dimensionless pressure";
            algorithm
              pi := p/data.PSTAR5;
              assert(p > triple.ptriple, "IF97 medium function hupperofp5 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              h := 461526.*(15.9838891400332 + pi*(-0.000489898813722568 + (-5.01510211858761e-8 + 7.5006972718273e-8*pi)*pi));
            end hupperofp5;

            function slowerofp5 "Explicit lower specific entropy limit of region 5 as function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real pi "Dimensionless pressure";
            algorithm
              pi := p/data.PSTAR5;
              assert(p > triple.ptriple, "IF97 medium function slowerofp5 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              s := 461.526*(18.4296209980112 + pi*(-0.00730911805860036 + (-0.0000168348072093888 + 2.09066899426354e-7*pi)*pi) - Modelica.Math.log(pi));
            end slowerofp5;

            function supperofp5 "Explicit upper specific entropy limit of region 5 as function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real pi "Dimensionless pressure";
            algorithm
              pi := p/data.PSTAR5;
              assert(p > triple.ptriple, "IF97 medium function supperofp5 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              s := 461.526*(22.7281531474243 + pi*(-0.000656650220627603 + (-1.96109739782049e-8 + 2.19979537113031e-8*pi)*pi) - Modelica.Math.log(pi));
            end supperofp5;

            function hlowerofp1 "Explicit lower specific enthalpy limit of region 1 as function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real pi1 "Dimensionless pressure";
              Real o[3] "Vector of auxiliary variables";
            algorithm
              pi1 := 7.1 - p/data.PSTAR1;
              assert(p > triple.ptriple, "IF97 medium function hlowerofp1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              o[1] := pi1*pi1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              h := 639675.036*(0.173379420894777 + pi1*(-0.022914084306349 + pi1*(-0.00017146768241932 + pi1*(-4.18695814670391e-6 + pi1*(-2.41630417490008e-7 + pi1*(1.73545618580828e-11 + o[1]*pi1*(8.43755552264362e-14 + o[2]*o[3]*pi1*(5.35429206228374e-35 + o[1]*(-8.12140581014818e-38 + o[1]*o[2]*(-1.43870236842915e-44 + pi1*(1.73894459122923e-45 + (-7.06381628462585e-47 + 9.64504638626269e-49*pi1)*pi1)))))))))));
            end hlowerofp1;

            function hupperofp1 "Explicit upper specific enthalpy limit of region 1 as function of pressure (meets region 4 saturation pressure curve at 623.15 K)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real pi1 "Dimensionless pressure";
              Real o[3] "Vector of auxiliary variables";
            algorithm
              pi1 := 7.1 - p/data.PSTAR1;
              assert(p > triple.ptriple, "IF97 medium function hupperofp1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              o[1] := pi1*pi1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              h := 639675.036*(2.42896927729349 + pi1*(-0.00141131225285294 + pi1*(0.00143759406818289 + pi1*(0.000125338925082983 + pi1*(0.0000123617764767172 + pi1*(3.17834967400818e-6 + o[1]*pi1*(1.46754947271665e-8 + o[2]*o[3]*pi1*(1.86779322717506e-17 + o[1]*(-4.18568363667416e-19 + o[1]*o[2]*(-9.19148577641497e-22 + pi1*(4.27026404402408e-22 + (-6.66749357417962e-23 + 3.49930466305574e-24*pi1)*pi1)))))))))));
            end hupperofp1;

            function supperofp1 "Explicit upper specific entropy limit of region 1 as function of pressure (meets region 4 saturation pressure curve at 623.15 K)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real pi1 "Dimensionless pressure";
              Real o[3] "Vector of auxiliary variables";
            algorithm
              pi1 := 7.1 - p/data.PSTAR1;
              assert(p > triple.ptriple, "IF97 medium function supperofp1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              o[1] := pi1*pi1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              s := 461.526*(7.28316418503422 + pi1*(0.070602197808399 + pi1*(0.0039229343647356 + pi1*(0.000313009170788845 + pi1*(0.0000303619398631619 + pi1*(7.46739440045781e-6 + o[1]*pi1*(3.40562176858676e-8 + o[2]*o[3]*pi1*(4.21886233340801e-17 + o[1]*(-9.44504571473549e-19 + o[1]*o[2]*(-2.06859611434475e-21 + pi1*(9.60758422254987e-22 + (-1.49967810652241e-22 + 7.86863124555783e-24*pi1)*pi1)))))))))));
            end supperofp1;

            function hlowerofp2 "Explicit lower specific enthalpy limit of region 2 as function of pressure (meets region 4 saturation pressure curve at 623.15 K)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real pi "Dimensionless pressure";
              Real q1 "Auxiliary variable";
              Real q2 "Auxiliary variable";
              Real o[18] "Vector of auxiliary variables";
            algorithm
              pi := p/data.PSTAR2;
              assert(p > triple.ptriple, "IF97 medium function hlowerofp2 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              q1 := 572.54459862746 + 31.3220101646784*sqrt(-13.91883977887 + pi);
              q2 := -0.5 + 540./q1;
              o[1] := q1*q1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              o[4] := pi*pi;
              o[5] := o[4]*o[4];
              o[6] := q2*q2;
              o[7] := o[6]*o[6];
              o[8] := o[6]*o[7];
              o[9] := o[5]*o[5];
              o[10] := o[7]*o[7];
              o[11] := o[9]*o[9];
              o[12] := o[10]*o[10];
              o[13] := o[12]*o[12];
              o[14] := o[7]*q2;
              o[15] := o[6]*q2;
              o[16] := o[10]*o[6];
              o[17] := o[13]*o[6];
              o[18] := o[13]*o[6]*q2;
              h := (4.63697573303507e9 + 3.74686560065793*o[2] + 3.57966647812489e-6*o[1]*o[2] + 2.81881548488163e-13*o[3] - 7.64652332452145e7*q1 - 0.00450789338787835*o[2]*q1 - 1.55131504410292e-9*o[1]*o[2]*q1 + o[1]*(2.51383707870341e6 - 4.78198198764471e6*o[10]*o[11]*o[12]*o[13]*o[4] + 49.9651389369988*o[11]*o[12]*o[13]*o[4]*o[5]*o[7] + o[15]*o[4]*(1.03746636552761e-13 - 0.00349547959376899*o[16] - 2.55074501962569e-7*o[8])*o[9] + (-242662.235426958*o[10]*o[12] - 3.46022402653609*o[16])*o[4]*o[5]*pi + o[4]*(0.109336249381227 - 2248.08924686956*o[14] - 354742.725841972*o[17] - 24.1331193696374*o[6])*pi - 3.09081828396912e-19*o[11]*o[12]*o[5]*o[7]*pi - 1.24107527851371e-8*o[11]*o[13]*o[4]*o[5]*o[6]*o[7]*pi + 3.99891272904219*o[5]*o[8]*pi + 0.0641817365250892*o[10]*o[7]*o[9]*pi + pi*(-4444.87643334512 - 75253.6156722047*o[14] - 43051.9020511789*o[6] - 22926.6247146068*q2) + o[4]*(-8.23252840892034 - 3927.0508365636*o[15] - 239.325789467604*o[18] - 76407.3727417716*o[8] - 94.4508644545118*q2) + 0.360567666582363*o[5]*(-0.0161221195808321 + q2)*(0.0338039844460968 + q2) + o[11]*(-0.000584580992538624*o[10]*o[12]*o[7] + 1.33248030241755e6*o[12]*o[13]*q2) + o[9]*(-7.38502736990986e7*o[18] + 0.0000224425477627799*o[6]*o[7]*q2) + o[4]*o[5]*(-2.08438767026518e8*o[17] - 0.0000124971648677697*o[6] - 8442.30378348203*o[10]*o[6]*o[7]*q2) + o[11]*o[9]*(4.73594929247646e-22*o[10]*o[12]*q2 - 13.6411358215175*o[10]*o[12]*o[13]*q2 + 5.52427169406836e-10*o[13]*o[6]*o[7]*q2) + o[11]*o[5]*(2.67174673301715e-6*o[17] + 4.44545133805865e-18*o[12]*o[6]*q2 - 50.2465185106411*o[10]*o[13]*o[6]*o[7]*q2)))/o[1];
            end hlowerofp2;

            function hupperofp2 "Explicit upper specific enthalpy limit of region 2 as function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real pi "Dimensionless pressure";
              Real o[2] "Vector of auxiliary variables";
            algorithm
              pi := p/data.PSTAR2;
              assert(p > triple.ptriple, "IF97 medium function hupperofp2 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              o[1] := pi*pi;
              o[2] := o[1]*o[1]*o[1];
              h := 4.16066337647071e6 + pi*(-4518.48617188327 + pi*(-8.53409968320258 + pi*(0.109090430596056 + pi*(-0.000172486052272327 + pi*(4.2261295097284e-15 + pi*(-1.27295130636232e-10 + pi*(-3.79407294691742e-25 + pi*(7.56960433802525e-23 + pi*(7.16825117265975e-32 + pi*(3.37267475986401e-21 + (-7.5656940729795e-74 + o[1]*(-8.00969737237617e-134 + (1.6746290980312e-65 + pi*(-3.71600586812966e-69 + pi*(8.06630589170884e-129 + (-1.76117969553159e-103 + 1.88543121025106e-84*pi)*pi)))*o[1]))*o[2]))))))))));
            end hupperofp2;

            function slowerofp2 "Explicit lower specific entropy limit of region 2 as function of pressure (meets region 4 saturation pressure curve at 623.15 K)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real pi "Dimensionless pressure";
              Real q1 "Auxiliary variable";
              Real q2 "Auxiliary variable";
              Real o[40] "Vector of auxiliary variables";
            algorithm
              pi := p/data.PSTAR2;
              assert(p > triple.ptriple, "IF97 medium function slowerofp2 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              q1 := 572.54459862746 + 31.3220101646784*sqrt(-13.91883977887 + pi);
              q2 := -0.5 + 540.0/q1;
              o[1] := pi*pi;
              o[2] := o[1]*pi;
              o[3] := o[1]*o[1];
              o[4] := o[1]*o[3]*pi;
              o[5] := q1*q1;
              o[6] := o[5]*q1;
              o[7] := 1/o[5];
              o[8] := 1/q1;
              o[9] := o[5]*o[5];
              o[10] := o[9]*q1;
              o[11] := q2*q2;
              o[12] := o[11]*q2;
              o[13] := o[1]*o[3];
              o[14] := o[11]*o[11];
              o[15] := o[3]*o[3];
              o[16] := o[1]*o[15];
              o[17] := o[11]*o[14];
              o[18] := o[11]*o[14]*q2;
              o[19] := o[3]*pi;
              o[20] := o[14]*o[14];
              o[21] := o[11]*o[20];
              o[22] := o[15]*pi;
              o[23] := o[14]*o[20]*q2;
              o[24] := o[20]*o[20];
              o[25] := o[15]*o[15];
              o[26] := o[25]*o[3];
              o[27] := o[14]*o[24];
              o[28] := o[25]*o[3]*pi;
              o[29] := o[20]*o[24]*q2;
              o[30] := o[15]*o[25];
              o[31] := o[24]*o[24];
              o[32] := o[11]*o[31]*q2;
              o[33] := o[14]*o[31];
              o[34] := o[1]*o[25]*o[3]*pi;
              o[35] := o[11]*o[14]*o[31]*q2;
              o[36] := o[1]*o[25]*o[3];
              o[37] := o[1]*o[25];
              o[38] := o[20]*o[24]*o[31]*q2;
              o[39] := o[14]*q2;
              o[40] := o[11]*o[31];
              s := 461.526*(9.692768600217 + 1.22151969114703e-16*o[10] + 0.00018948987516315*o[1]*o[11] + 1.6714766451061e-11*o[12]*o[13] + 0.0039392777243355*o[1]*o[14] - 1.0406965210174e-19*o[14]*o[16] + 0.043797295650573*o[1]*o[18] - 2.2922076337661e-6*o[18]*o[19] - 2.0481737692309e-8*o[2] + 0.00003227767723857*o[12]*o[2] + 0.0015033924542148*o[17]*o[2] - 1.1256211360459e-11*o[15]*o[20] + 1.0018179379511e-9*o[11]*o[14]*o[16]*o[20] + 1.0234747095929e-13*o[16]*o[21] - 1.9809712802088e-8*o[22]*o[23] + 0.0021171472321355*o[13]*o[24] - 8.9185845355421e-25*o[26]*o[27] - 1.2790717852285e-8*o[11]*o[3] - 4.8225372718507e-7*o[12]*o[3] - 7.3087610595061e-29*o[11]*o[20]*o[24]*o[30] - 0.10693031879409*o[11]*o[24]*o[25]*o[31] + 4.2002467698208e-6*o[24]*o[26]*o[31] - 5.5414715350778e-17*o[20]*o[30]*o[31] + 9.436970724121e-7*o[11]*o[20]*o[24]*o[30]*o[31] + 23.895741934104*o[13]*o[32] + 0.040668253562649*o[2]*o[32] - 3.0629316876232e-13*o[26]*o[32] + 0.000026674547914087*o[1]*o[33] + 8.2311340897998*o[15]*o[33] + 1.2768608934681e-15*o[34]*o[35] + 0.33662250574171*o[37]*o[38] + 5.905956432427e-18*o[4] + 0.038946842435739*o[29]*o[4] - 4.88368302964335e-6*o[5] - 3.34901734177133e6/o[6] + 2.58538448402683e-9*o[6] + 82839.5726841115*o[7] - 5446.7940672972*o[8] - 8.40318337484194e-13*o[9] + 0.0017731742473213*pi + 0.045996013696365*o[11]*pi + 0.057581259083432*o[12]*pi + 0.05032527872793*o[17]*pi + o[8]*pi*(9.63082563787332 - 0.008917431146179*q1) + 0.00811842799898148*q1 + 0.000033032641670203*o[1]*q2 - 4.3870667284435e-7*o[2]*q2 + 8.0882908646985e-11*o[14]*o[20]*o[24]*o[25]*q2 + 5.9056029685639e-26*o[14]*o[24]*o[28]*q2 + 7.8847309559367e-10*o[3]*q2 - 3.7826947613457e-6*o[14]*o[24]*o[31]*o[36]*q2 + 1.2621808899101e-6*o[11]*o[20]*o[4]*q2 + 540.*o[8]*(10.08665568018 - 0.000033032641670203*o[1] - 6.2245802776607e-15*o[10] - 0.015757110897342*o[1]*o[12] - 5.0144299353183e-11*o[11]*o[13] + 4.1627860840696e-19*o[12]*o[16] - 0.306581069554011*o[1]*o[17] + 9.0049690883672e-11*o[15]*o[18] + 0.0000160454534363627*o[17]*o[19] + 4.3870667284435e-7*o[2] - 0.00009683303171571*o[11]*o[2] + 2.57526266427144e-7*o[14]*o[20]*o[22] - 1.40254511313154e-8*o[16]*o[23] - 2.34560435076256e-9*o[14]*o[20]*o[24]*o[25] - 1.24017662339842e-24*o[27]*o[28] - 7.8847309559367e-10*o[3] + 1.44676118155521e-6*o[11]*o[3] + 1.90027787547159e-27*o[29]*o[30] - 0.000960283724907132*o[1]*o[32] - 296.320827232793*o[15]*o[32] - 4.97975748452559e-14*o[11]*o[14]*o[31]*o[34] + 2.21658861403112e-15*o[30]*o[35] + 0.000200482822351322*o[14]*o[24]*o[31]*o[36] - 19.1874828272775*o[20]*o[24]*o[31]*o[37] - 0.0000547344301999018*o[30]*o[38] - 0.0090203547252888*o[2]*o[39] - 0.0000138839897890111*o[21]*o[4] - 0.973671060893475*o[20]*o[24]*o[4] - 836.35096769364*o[13]*o[40] - 1.42338887469272*o[2]*o[40] + 1.07202609066812e-11*o[26]*o[40] + 0.0000150341259240398*o[5] - 1.8087714924605e-8*o[6] + 18605.6518987296*o[7] - 306.813232163376*o[8] + 1.43632471334824e-11*o[9] + 1.13103675106207e-18*o[5]*o[9] - 0.017834862292358*pi - 0.172743777250296*o[11]*pi - 0.30195167236758*o[39]*pi + o[8]*pi*(-49.6756947920742 + 0.045996013696365*q1) - 0.0003789797503263*o[1]*q2 - 0.033874355714168*o[11]*o[13]*o[14]*o[20]*q2 - 1.0234747095929e-12*o[16]*o[20]*q2 + 1.78371690710842e-23*o[11]*o[24]*o[26]*q2 + 2.558143570457e-8*o[3]*q2 + 5.3465159397045*o[24]*o[25]*o[31]*q2 - 0.000201611844951398*o[11]*o[14]*o[20]*o[26]*o[31]*q2) - Modelica.Math.log(pi));
            end slowerofp2;

            function supperofp2 "Explicit upper specific entropy limit of region 2 as function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real pi "Dimensionless pressure";
              Real o[2] "Vector of auxiliary variables";
            algorithm
              pi := p/data.PSTAR2;
              assert(p > triple.ptriple, "IF97 medium function supperofp2 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              o[1] := pi*pi;
              o[2] := o[1]*o[1]*o[1];
              s := 8505.73409708683 - 461.526*Modelica.Math.log(pi) + pi*(-3.36563543302584 + pi*(-0.00790283552165338 + pi*(0.0000915558349202221 + pi*(-1.59634706513e-7 + pi*(3.93449217595397e-18 + pi*(-1.18367426347994e-13 + pi*(2.72575244843195e-15 + pi*(7.04803892603536e-26 + pi*(6.67637687381772e-35 + pi*(3.1377970315132e-24 + (-7.04844558482265e-77 + o[1]*(-7.46289531275314e-137 + (1.55998511254305e-68 + pi*(-3.46166288915497e-72 + pi*(7.51557618628583e-132 + (-1.64086406733212e-106 + 1.75648443097063e-87*pi)*pi)))*o[1]))*o[2]*o[2]))))))))));
            end supperofp2;

            function d1n "Density in region 1 as function of p and T"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output SI.Density d "Density";
            protected
              Real pi "Dimensionless pressure";
              Real pi1 "Dimensionless pressure";
              Real tau "Dimensionless temperature";
              Real tau1 "Dimensionless temperature";
              Real gpi "Dimensionless Gibbs-derivative w.r.t. pi";
              Real o[11] "Auxiliary variables";
            algorithm
              pi := p/data.PSTAR1;
              tau := data.TSTAR1/T;
              pi1 := 7.1 - pi;
              tau1 := tau - 1.222;
              o[1] := tau1*tau1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              o[4] := o[1]*o[2];
              o[5] := o[1]*tau1;
              o[6] := o[2]*tau1;
              o[7] := pi1*pi1;
              o[8] := o[7]*o[7];
              o[9] := o[8]*o[8];
              o[10] := o[3]*o[3];
              o[11] := o[10]*o[10];
              gpi := pi1*(pi1*((0.000095038934535162 + o[2]*(8.4812393955936e-6 + 2.55615384360309e-9*o[4]))/o[2] + pi1*((8.9701127632e-6 + (2.60684891582404e-6 + 5.7366919751696e-13*o[2]*o[3])*o[5])/o[6] + pi1*(2.02584984300585e-6/o[3] + o[7]*pi1*(o[8]*o[9]*pi1*(o[7]*(o[7]*o[8]*(-7.63737668221055e-22/(o[1]*o[11]*o[2]) + pi1*(pi1*(-5.65070932023524e-23/(o[11]*o[3]) + (2.99318679335866e-24*pi1)/(o[11]*o[3]*tau1)) + 3.5842867920213e-22/(o[1]*o[11]*o[2]*tau1))) - 3.33001080055983e-19/(o[1]*o[10]*o[2]*o[3]*tau1)) + 1.44400475720615e-17/(o[10]*o[2]*o[3]*tau1)) + (1.01874413933128e-8 + 1.39398969845072e-9*o[6])/(o[1]*o[3]*tau1))))) + (0.00094368642146534 + o[5]*(0.00060003561586052 + (-0.000095322787813974 + o[1]*(8.8283690661692e-6 + 1.45389992595188e-15*o[1]*o[2]*o[3]))*tau1))/o[5]) + (-0.00028319080123804 + o[1]*(0.00060706301565874 + o[4]*(0.018990068218419 + tau1*(0.032529748770505 + (0.021841717175414 + 0.00005283835796993*o[1])*tau1))))/(o[3]*tau1);
              d := p/(data.RH2O*T*pi*gpi);
            end d1n;

            function d2n "Density in region 2 as function of p and T"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output SI.Density d "Density";
            protected
              Real pi "Dimensionless pressure";
              Real tau "Dimensionless temperature";
              Real tau2 "Dimensionless temperature";
              Real gpi "Dimensionless Gibbs-derivative w.r.t. pi";
              Real o[12] "Auxiliary variables";
            algorithm
              pi := p/data.PSTAR2;
              tau := data.TSTAR2/T;
              tau2 := tau - 0.5;
              o[1] := tau2*tau2;
              o[2] := o[1]*tau2;
              o[3] := o[1]*o[1];
              o[4] := o[3]*o[3];
              o[5] := o[4]*o[4];
              o[6] := o[3]*o[4]*o[5]*tau2;
              o[7] := o[3]*o[4]*tau2;
              o[8] := o[1]*o[3]*o[4];
              o[9] := pi*pi;
              o[10] := o[9]*o[9];
              o[11] := o[3]*o[5]*tau2;
              o[12] := o[5]*o[5];
              gpi := (1. + pi*(-0.0017731742473213 + tau2*(-0.017834862292358 + tau2*(-0.045996013696365 + (-0.057581259083432 - 0.05032527872793*o[2])*tau2)) + pi*(tau2*(-0.000066065283340406 + (-0.0003789797503263 + o[1]*(-0.007878555448671 + o[2]*(-0.087594591301146 - 0.000053349095828174*o[6])))*tau2) + pi*(6.1445213076927e-8 + (1.31612001853305e-6 + o[1]*(-0.00009683303171571 + o[2]*(-0.0045101773626444 - 0.122004760687947*o[6])))*tau2 + pi*(tau2*(-3.15389238237468e-9 + (5.116287140914e-8 + 1.92901490874028e-6*tau2)*tau2) + pi*(0.0000114610381688305*o[1]*o[3]*tau2 + pi*(o[2]*(-1.00288598706366e-10 + o[7]*(-0.012702883392813 - 143.374451604624*o[1]*o[5]*tau2)) + pi*(-4.1341695026989e-17 + o[1]*o[4]*(-8.8352662293707e-6 - 0.272627897050173*o[8])*tau2 + pi*(o[4]*(9.0049690883672e-11 - 65.8490727183984*o[3]*o[4]*o[5]) + pi*(1.78287415218792e-7*o[7] + pi*(o[3]*(1.0406965210174e-18 + o[1]*(-1.0234747095929e-12 - 1.0018179379511e-8*o[3])*o[3]) + o[10]*o[9]*((-1.29412653835176e-9 + 1.71088510070544*o[11])*o[6] + o[9]*(-6.05920510335078*o[12]*o[4]*o[5]*tau2 + o[9]*(o[3]*o[5]*(1.78371690710842e-23 + o[1]*o[3]*o[4]*(6.1258633752464e-12 - 0.000084004935396416*o[7])*tau2) + pi*(-1.24017662339842e-24*o[11] + pi*(0.0000832192847496054*o[12]*o[3]*o[5]*tau2 + pi*(o[1]*o[4]*o[5]*(1.75410265428146e-27 + (1.32995316841867e-15 - 0.0000226487297378904*o[1]*o[5])*o[8])*pi - 2.93678005497663e-14*o[1]*o[12]*o[3]*tau2)))))))))))))))))/pi;
              d := p/(data.RH2O*T*pi*gpi);
            end d2n;

            function hl_p_R4b "Explicit approximation of liquid specific enthalpy on the boundary between regions 4 and 3"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real x "Auxiliary variable";
            algorithm
              x := Modelica.Math.acos(p/data.PCRIT);
              h := (1 + x*(-0.4945586958175176 + x*(1.346800016564904 + x*(-3.889388153209752 + x*(6.679385472887931 + x*(-6.75820241066552 + x*(3.558919744656498 + (-0.7179818554978939 - 0.0001152032945617821*x)*x)))))))*data.HCRIT;
            end hl_p_R4b;

            function hv_p_R4b "Explicit approximation of vapour specific enthalpy on the boundary between regions 4 and 3"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real x "Auxiliary variable";
            algorithm
              x := Modelica.Math.acos(p/data.PCRIT);
              h := (1 + x*(0.4880153718655694 + x*(0.2079670746250689 + x*(-6.084122698421623 + x*(25.08887602293532 + x*(-48.38215180269516 + x*(45.66489164833212 + (-16.98555442961553 + 0.0006616936460057691*x)*x)))))))*data.HCRIT;
            end hv_p_R4b;

            function sl_p_R4b "Explicit approximation of liquid specific entropy on the boundary between regions 4 and 3"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real x "Auxiliary variable";
            algorithm
              x := Modelica.Math.acos(p/data.PCRIT);
              s := (1 + x*(-0.36160692245648063 + x*(0.9962778630486647 + x*(-2.8595548144171103 + x*(4.906301159555333 + x*(-4.974092309614206 + x*(2.6249651699204457 + (-0.5319954375299023 - 0.00008064497431880644*x)*x)))))))*data.SCRIT;
            end sl_p_R4b;

            function sv_p_R4b "Explicit approximation of vapour specific entropy on the boundary between regions 4 and 3"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real x "Auxiliary variable";
            algorithm
              x := Modelica.Math.acos(p/data.PCRIT);
              s := (1 + x*(0.35682641826674344 + x*(0.1642457027815487 + x*(-4.425350377422446 + x*(18.324477859983133 + x*(-35.338631625948665 + x*(33.36181025816282 + (-12.408711490585757 + 0.0004810049834109226*x)*x)))))))*data.SCRIT;
            end sv_p_R4b;

            function rhol_p_R4b "Explicit approximation of liquid density on the boundary between regions 4 and 3"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.Density dl "Liquid density";
            protected
              Real x "Auxiliary variable";
            algorithm
              if (p < data.PCRIT) then
                x := Modelica.Math.acos(p/data.PCRIT);
                dl := (1 + x*(1.903224079094824 + x*(-2.5314861802401123 + x*(-8.191449323843552 + x*(94.34196116778385 + x*(-369.3676833623383 + x*(796.6627910598293 + x*(-994.5385383600702 + x*(673.2581177021598 + (-191.43077336405156 + 0.00052536560808895*x)*x)))))))))*data.DCRIT;
              else
                dl := data.DCRIT;
              end if;
            end rhol_p_R4b;

            function rhov_p_R4b "Explicit approximation of vapour density on the boundary between regions 4 and 2"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.Density dv "Vapour density";
            protected
              Real x "Auxiliary variable";
            algorithm
              if (p < data.PCRIT) then
                x := Modelica.Math.acos(p/data.PCRIT);
                dv := (1 + x*(-1.8463850803362596 + x*(-1.1447872718878493 + x*(59.18702203076563 + x*(-403.5391431811611 + x*(1437.2007245332388 + x*(-3015.853540307519 + x*(3740.5790348670057 + x*(-2537.375817253895 + (725.8761975803782 - 0.0011151111658332337*x)*x)))))))))*data.DCRIT;
              else
                dv := data.DCRIT;
              end if;
            end rhov_p_R4b;

            function boilingcurve_p "Properties on the boiling curve"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output Common.IF97PhaseBoundaryProperties bpro "Property record";
            protected
              Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives";
              Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives";
              SI.Pressure plim = min(p, data.PCRIT - 1e-7) "Pressure limited to critical pressure - epsilon";
            algorithm
              bpro.R_s := data.RH2O;
              bpro.T := Basic.tsat(plim);
              bpro.dpT := Basic.dptofT(bpro.T);
              bpro.region3boundary := bpro.T > data.TLIMIT1;
              if not bpro.region3boundary then
                g := Basic.g1(p, bpro.T);
                bpro.d := p/(bpro.R_s*bpro.T*g.pi*g.gpi);
                bpro.h := if p > plim then data.HCRIT else bpro.R_s*bpro.T*g.tau*g.gtau;
                bpro.s := g.R_s*(g.tau*g.gtau - g.g);
                bpro.cp := -bpro.R_s*g.tau*g.tau*g.gtautau;
                bpro.vt := bpro.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
                bpro.vp := bpro.R_s*bpro.T/(p*p)*g.pi*g.pi*g.gpipi;
                bpro.pt := -p/bpro.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
                bpro.pd := -bpro.R_s*bpro.T*g.gpi*g.gpi/(g.gpipi);
              else
                bpro.d := rhol_p_R4b(plim);
                f := Basic.f3(bpro.d, bpro.T);
                bpro.h := hl_p_R4b(plim);
                bpro.s := f.R_s*(f.tau*f.ftau - f.f);
                bpro.cv := bpro.R_s*(-f.tau*f.tau*f.ftautau);
                bpro.pt := bpro.R_s*bpro.d*f.delta*(f.fdelta - f.tau*f.fdeltatau);
                bpro.pd := bpro.R_s*bpro.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
              end if;
            end boilingcurve_p;

            function dewcurve_p "Properties on the dew curve"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output Common.IF97PhaseBoundaryProperties bpro "Property record";
            protected
              Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives";
              Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives";
              SI.Pressure plim = min(p, data.PCRIT - 1e-7) "Pressure limited to critical pressure - epsilon";
            algorithm
              bpro.R_s := data.RH2O;
              bpro.T := Basic.tsat(plim);
              bpro.dpT := Basic.dptofT(bpro.T);
              bpro.region3boundary := bpro.T > data.TLIMIT1;
              if not bpro.region3boundary then
                g := Basic.g2(p, bpro.T);
                bpro.d := p/(bpro.R_s*bpro.T*g.pi*g.gpi);
                bpro.h := if p > plim then data.HCRIT else bpro.R_s*bpro.T*g.tau*g.gtau;
                bpro.s := g.R_s*(g.tau*g.gtau - g.g);
                bpro.cp := -bpro.R_s*g.tau*g.tau*g.gtautau;
                bpro.vt := bpro.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
                bpro.vp := bpro.R_s*bpro.T/(p*p)*g.pi*g.pi*g.gpipi;
                bpro.pt := -p/bpro.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
                bpro.pd := -bpro.R_s*bpro.T*g.gpi*g.gpi/(g.gpipi);
              else
                bpro.d := rhov_p_R4b(plim);
                f := Basic.f3(bpro.d, bpro.T);
                bpro.h := hv_p_R4b(plim);
                bpro.s := f.R_s*(f.tau*f.ftau - f.f);
                bpro.cv := bpro.R_s*(-f.tau*f.tau*f.ftautau);
                bpro.pt := bpro.R_s*bpro.d*f.delta*(f.fdelta - f.tau*f.fdeltatau);
                bpro.pd := bpro.R_s*bpro.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
              end if;
            end dewcurve_p;

            function hvl_p
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input Common.IF97PhaseBoundaryProperties bpro "Property record";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            algorithm
              h := bpro.h;
              annotation(derivative(noDerivative = bpro) = hvl_p_der, Inline = false, LateInline = true);
            end hvl_p;

            function hl_p "Liquid specific enthalpy on the boundary between regions 4 and 3 or 1"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            algorithm
              h := hvl_p(p, boilingcurve_p(p));
              annotation(Inline = true);
            end hl_p;

            function hv_p "Vapour specific enthalpy on the boundary between regions 4 and 3 or 2"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            algorithm
              h := hvl_p(p, dewcurve_p(p));
              annotation(Inline = true);
            end hv_p;

            function hvl_p_der "Derivative function for the specific enthalpy along the phase boundary"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input Common.IF97PhaseBoundaryProperties bpro "Property record";
              input Real p_der "Derivative of pressure";
              output Real h_der "Time derivative of specific enthalpy along the phase boundary";
            algorithm
              if bpro.region3boundary then
                h_der := ((bpro.d*bpro.pd - bpro.T*bpro.pt)*p_der + (bpro.T*bpro.pt*bpro.pt + bpro.d*bpro.d*bpro.pd*bpro.cv)/bpro.dpT*p_der)/(bpro.pd*bpro.d*bpro.d);
              else
                h_der := (1/bpro.d - bpro.T*bpro.vt)*p_der + bpro.cp/bpro.dpT*p_der;
              end if;
              annotation(Inline = true);
            end hvl_p_der;

            function rhovl_p
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input Common.IF97PhaseBoundaryProperties bpro "Property record";
              output SI.Density rho "Density";
            algorithm
              rho := bpro.d;
              annotation(derivative(noDerivative = bpro) = rhovl_p_der, Inline = false, LateInline = true);
            end rhovl_p;

            function rhol_p "Density of saturated water"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Saturation pressure";
              output SI.Density rho "Density of steam at the condensation point";
            algorithm
              rho := rhovl_p(p, boilingcurve_p(p));
              annotation(Inline = true);
            end rhol_p;

            function rhov_p "Density of saturated vapour"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Saturation pressure";
              output SI.Density rho "Density of steam at the condensation point";
            algorithm
              rho := rhovl_p(p, dewcurve_p(p));
              annotation(Inline = true);
            end rhov_p;

            function rhovl_p_der
              extends Modelica.Icons.Function;
              input SI.Pressure p "Saturation pressure";
              input Common.IF97PhaseBoundaryProperties bpro "Property record";
              input Real p_der "Derivative of pressure";
              output Real d_der "Time derivative of density along the phase boundary";
            algorithm
              d_der := if bpro.region3boundary then (p_der - bpro.pt*p_der/bpro.dpT)/bpro.pd else -bpro.d*bpro.d*(bpro.vp + bpro.vt/bpro.dpT)*p_der;
              annotation(Inline = true);
            end rhovl_p_der;

            function sl_p "Liquid specific entropy on the boundary between regions 4 and 3 or 1"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              SI.Temperature Tsat "Saturation temperature";
              SI.SpecificEnthalpy h "Specific enthalpy";
            algorithm
              if (p < data.PLIMIT4A) then
                Tsat := Basic.tsat(p);
                (h, s) := Isentropic.handsofpT1(p, Tsat);
              elseif (p < data.PCRIT) then
                s := sl_p_R4b(p);
              else
                s := data.SCRIT;
              end if;
            end sl_p;

            function sv_p "Vapour specific entropy on the boundary between regions 4 and 3 or 2"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              SI.Temperature Tsat "Saturation temperature";
              SI.SpecificEnthalpy h "Specific enthalpy";
            algorithm
              if (p < data.PLIMIT4A) then
                Tsat := Basic.tsat(p);
                (h, s) := Isentropic.handsofpT2(p, Tsat);
              elseif (p < data.PCRIT) then
                s := sv_p_R4b(p);
              else
                s := data.SCRIT;
              end if;
            end sv_p;

            function rhol_T "Density of saturated water"
              extends Modelica.Icons.Function;
              input SI.Temperature T "Temperature";
              output SI.Density d "Density of water at the boiling point";
            protected
              SI.Pressure p "Saturation pressure";
            algorithm
              p := Basic.psat(T);
              if T < data.TLIMIT1 then
                d := d1n(p, T);
              elseif T < data.TCRIT then
                d := rhol_p_R4b(p);
              else
                d := data.DCRIT;
              end if;
            end rhol_T;

            function rhov_T "Density of saturated vapour"
              extends Modelica.Icons.Function;
              input SI.Temperature T "Temperature";
              output SI.Density d "Density of steam at the condensation point";
            protected
              SI.Pressure p "Saturation pressure";
            algorithm
              p := Basic.psat(T);
              if T < data.TLIMIT1 then
                d := d2n(p, T);
              elseif T < data.TCRIT then
                d := rhov_p_R4b(p);
              else
                d := data.DCRIT;
              end if;
            end rhov_T;

            function region_ph "Return the current region (valid values: 1,2,3,4,5) in IF97 for given pressure and specific enthalpy"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              input Integer phase = 0 "Phase: 2 for two-phase, 1 for one phase, 0 if not known";
              input Integer mode = 0 "Mode: 0 means check, otherwise assume region=mode";
              output Integer region "Region (valid values: 1,2,3,4,5) in IF97";
            protected
              Boolean hsubcrit;
              SI.Temperature Ttest;
              SI.SpecificEnthalpy hl "Bubble enthalpy";
              SI.SpecificEnthalpy hv "Dew enthalpy";
            algorithm
              if (mode <> 0) then
                region := mode;
              else
                hl := hl_p(p);
                hv := hv_p(p);
                if (phase == 2) then
                  region := 4;
                else
                  if (p < triple.ptriple) or (p > data.PLIMIT1) or (h < hlowerofp1(p)) or ((p < 10.0e6) and (h > hupperofp5(p))) or ((p >= 10.0e6) and (h > hupperofp2(p))) then
                    region := -1;
                  else
                    hsubcrit := (h < data.HCRIT);
                    if (p < data.PLIMIT4A) then
                      if hsubcrit then
                        if (phase == 1) then
                          region := 1;
                        else
                          if (h < Isentropic.hofpT1(p, Basic.tsat(p))) then
                            region := 1;
                          else
                            region := 4;
                          end if;
                        end if;
                      else
                        if (h > hlowerofp5(p)) then
                          if ((p < data.PLIMIT5) and (h < hupperofp5(p))) then
                            region := 5;
                          else
                            region := -2;
                          end if;
                        else
                          if (phase == 1) then
                            region := 2;
                          else
                            if (h > Isentropic.hofpT2(p, Basic.tsat(p))) then
                              region := 2;
                            else
                              region := 4;
                            end if;
                          end if;
                        end if;
                      end if;
                    else
                      if hsubcrit then
                        if h < hupperofp1(p) then
                          region := 1;
                        else
                          if h < hl or p > data.PCRIT then
                            region := 3;
                          else
                            region := 4;
                          end if;
                        end if;
                      else
                        if (h > hlowerofp2(p)) then
                          region := 2;
                        else
                          if h > hv or p > data.PCRIT then
                            region := 3;
                          else
                            region := 4;
                          end if;
                        end if;
                      end if;
                    end if;
                  end if;
                end if;
              end if;
            end region_ph;

            function region_ps "Return the current region (valid values: 1,2,3,4,5) in IF97 for given pressure and specific entropy"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              input Integer phase = 0 "Phase: 2 for two-phase, 1 for one phase, 0 if unknown";
              input Integer mode = 0 "Mode: 0 means check, otherwise assume region=mode";
              output Integer region "Region (valid values: 1,2,3,4,5) in IF97";
            protected
              Boolean ssubcrit;
              SI.Temperature Ttest;
              SI.SpecificEntropy sl "Bubble entropy";
              SI.SpecificEntropy sv "Dew entropy";
            algorithm
              if (mode <> 0) then
                region := mode;
              else
                sl := sl_p(p);
                sv := sv_p(p);
                if (phase == 2) or (phase == 0 and s > sl and s < sv and p < data.PCRIT) then
                  region := 4;
                else
                  region := 0;
                  if (p < triple.ptriple) then
                    region := -2;
                  else
                  end if;
                  if (p > data.PLIMIT1) then
                    region := -3;
                  else
                  end if;
                  if ((p < 10.0e6) and (s > supperofp5(p))) then
                    region := -5;
                  else
                  end if;
                  if ((p >= 10.0e6) and (s > supperofp2(p))) then
                    region := -6;
                  else
                  end if;
                  if region < 0 then
                    assert(false, "Region computation from p and s failed: function called outside the legal region");
                  else
                    ssubcrit := (s < data.SCRIT);
                    if (p < data.PLIMIT4A) then
                      if ssubcrit then
                        region := 1;
                      else
                        if (s > slowerofp5(p)) then
                          if ((p < data.PLIMIT5) and (s < supperofp5(p))) then
                            region := 5;
                          else
                            region := -1;
                          end if;
                        else
                          region := 2;
                        end if;
                      end if;
                    else
                      if ssubcrit then
                        if s < supperofp1(p) then
                          region := 1;
                        else
                          if s < sl or p > data.PCRIT then
                            region := 3;
                          else
                            region := 4;
                          end if;
                        end if;
                      else
                        if (s > slowerofp2(p)) then
                          region := 2;
                        else
                          if s > sv or p > data.PCRIT then
                            region := 3;
                          else
                            region := 4;
                          end if;
                        end if;
                      end if;
                    end if;
                  end if;
                end if;
              end if;
            end region_ps;

            function region_pT "Return the current region (valid values: 1,2,3,5) in IF97, given pressure and temperature"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              input Integer mode = 0 "Mode: 0 means check, otherwise assume region=mode";
              output Integer region "Region (valid values: 1,2,3,5) in IF97, region 4 is impossible!";
            algorithm
              if (mode <> 0) then
                region := mode;
              else
                if p < data.PLIMIT4A then
                  if T > data.TLIMIT2 then
                    region := 5;
                  elseif T > Basic.tsat(p) then
                    region := 2;
                  else
                    region := 1;
                  end if;
                else
                  if T < data.TLIMIT1 then
                    region := 1;
                  elseif T < boundary23ofp(p) then
                    region := 3;
                  else
                    region := 2;
                  end if;
                end if;
              end if;
            end region_pT;

            function region_dT "Return the current region (valid values: 1,2,3,4,5) in IF97, given density and temperature"
              extends Modelica.Icons.Function;
              input SI.Density d "Density";
              input SI.Temperature T "Temperature (K)";
              input Integer phase = 0 "Phase: 2 for two-phase, 1 for one phase, 0 if not known";
              input Integer mode = 0 "Mode: 0 means check, otherwise assume region=mode";
              output Integer region "(valid values: 1,2,3,4,5) in IF97";
            protected
              Boolean Tovercrit "Flag if overcritical temperature";
              SI.Pressure p23 "Pressure needed to know if region 2 or 3";
            algorithm
              Tovercrit := T > data.TCRIT;
              if (mode <> 0) then
                region := mode;
              else
                p23 := boundary23ofT(T);
                if T > data.TLIMIT2 then
                  if d < 20.5655874106483 then
                    region := 5;
                  else
                    assert(false, "Out of valid region for IF97, pressure above region 5!");
                  end if;
                elseif Tovercrit then
                  if d > d2n(p23, T) and T > data.TLIMIT1 then
                    region := 3;
                  elseif T < data.TLIMIT1 then
                    region := 1;
                  else
                    region := 2;
                  end if;
                elseif (d > rhol_T(T)) then
                  if T < data.TLIMIT1 then
                    region := 1;
                  else
                    region := 3;
                  end if;
                elseif (d < rhov_T(T)) then
                  if (d > d2n(p23, T) and T > data.TLIMIT1) then
                    region := 3;
                  else
                    region := 2;
                  end if;
                else
                  region := 4;
                end if;
              end if;
            end region_dT;

            function hvl_dp "Derivative function for the specific enthalpy along the phase boundary"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input Common.IF97PhaseBoundaryProperties bpro "Property record";
              output Real dh_dp "Derivative of specific enthalpy along the phase boundary";
            algorithm
              if bpro.region3boundary then
                dh_dp := ((bpro.d*bpro.pd - bpro.T*bpro.pt) + (bpro.T*bpro.pt*bpro.pt + bpro.d*bpro.d*bpro.pd*bpro.cv)/bpro.dpT)/(bpro.pd*bpro.d*bpro.d);
              else
                dh_dp := (1/bpro.d - bpro.T*bpro.vt) + bpro.cp/bpro.dpT;
              end if;
            end hvl_dp;

            function dhl_dp "Derivative of liquid specific enthalpy on the boundary between regions 4 and 3 or 1 w.r.t. pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.DerEnthalpyByPressure dh_dp "Specific enthalpy derivative w.r.t. pressure";
            algorithm
              dh_dp := hvl_dp(p, boilingcurve_p(p));
              annotation(Inline = true);
            end dhl_dp;

            function dhv_dp "Derivative of vapour specific enthalpy on the boundary between regions 4 and 3 or 1 w.r.t. pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.DerEnthalpyByPressure dh_dp "Specific enthalpy derivative w.r.t. pressure";
            algorithm
              dh_dp := hvl_dp(p, dewcurve_p(p));
              annotation(Inline = true);
            end dhv_dp;

            function drhovl_dp
              extends Modelica.Icons.Function;
              input SI.Pressure p "Saturation pressure";
              input Common.IF97PhaseBoundaryProperties bpro "Property record";
              output Real dd_dp(unit = "kg/(m3.Pa)") "Derivative of density along the phase boundary";
            algorithm
              dd_dp := if bpro.region3boundary then (1.0 - bpro.pt/bpro.dpT)/bpro.pd else -bpro.d*bpro.d*(bpro.vp + bpro.vt/bpro.dpT);
              annotation(Inline = true);
            end drhovl_dp;

            function drhol_dp "Derivative of density of saturated water w.r.t. pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Saturation pressure";
              output SI.DerDensityByPressure dd_dp "Derivative of density of water at the boiling point";
            algorithm
              dd_dp := drhovl_dp(p, boilingcurve_p(p));
              annotation(Inline = true);
            end drhol_dp;

            function drhov_dp "Derivative of density of saturated steam w.r.t. pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Saturation pressure";
              output SI.DerDensityByPressure dd_dp "Derivative of density of water at the boiling point";
            algorithm
              dd_dp := drhovl_dp(p, dewcurve_p(p));
              annotation(Inline = true);
            end drhov_dp;
          end Regions;

          package Basic "Base functions as described in IAWPS/IF97"
            extends Modelica.Icons.FunctionsPackage;

            function g1 "Gibbs function for region 1: g(p,T)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output Modelica.Media.Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
            protected
              Real pi1 "Dimensionless pressure";
              Real tau1 "Dimensionless temperature";
              Real o[45] "Vector of auxiliary variables";
              Real pl "Auxiliary variable";
            algorithm
              pl := min(p, data.PCRIT - 1);
              assert(p > triple.ptriple, "IF97 medium function g1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              assert(p <= 100.0e6, "IF97 medium function g1: the input pressure (= " + String(p) + " Pa) is higher than 100 MPa");
              assert(T >= 273.15, "IF97 medium function g1: the temperature (= " + String(T) + " K) is lower than 273.15 K!");
              g.p := p;
              g.T := T;
              g.R_s := data.RH2O;
              g.pi := p/data.PSTAR1;
              g.tau := data.TSTAR1/T;
              pi1 := 7.1000000000000 - g.pi;
              tau1 := -1.22200000000000 + g.tau;
              o[1] := tau1*tau1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              o[4] := o[3]*tau1;
              o[5] := 1/o[4];
              o[6] := o[1]*o[2];
              o[7] := o[1]*tau1;
              o[8] := 1/o[7];
              o[9] := o[1]*o[2]*o[3];
              o[10] := 1/o[2];
              o[11] := o[2]*tau1;
              o[12] := 1/o[11];
              o[13] := o[2]*o[3];
              o[14] := 1/o[3];
              o[15] := pi1*pi1;
              o[16] := o[15]*pi1;
              o[17] := o[15]*o[15];
              o[18] := o[17]*o[17];
              o[19] := o[17]*o[18]*pi1;
              o[20] := o[15]*o[17];
              o[21] := o[3]*o[3];
              o[22] := o[21]*o[21];
              o[23] := o[22]*o[3]*tau1;
              o[24] := 1/o[23];
              o[25] := o[22]*o[3];
              o[26] := 1/o[25];
              o[27] := o[1]*o[2]*o[22]*tau1;
              o[28] := 1/o[27];
              o[29] := o[1]*o[2]*o[22];
              o[30] := 1/o[29];
              o[31] := o[1]*o[2]*o[21]*o[3]*tau1;
              o[32] := 1/o[31];
              o[33] := o[2]*o[21]*o[3]*tau1;
              o[34] := 1/o[33];
              o[35] := o[1]*o[3]*tau1;
              o[36] := 1/o[35];
              o[37] := o[1]*o[3];
              o[38] := 1/o[37];
              o[39] := 1/o[6];
              o[40] := o[1]*o[22]*o[3];
              o[41] := 1/o[40];
              o[42] := 1/o[22];
              o[43] := o[1]*o[2]*o[21]*o[3];
              o[44] := 1/o[43];
              o[45] := 1/o[13];
              g.g := pi1*(pi1*(pi1*(o[10]*(-0.000031679644845054 + o[2]*(-2.82707979853120e-6 - 8.5205128120103e-10*o[6])) + pi1*(o[12]*(-2.24252819080000e-6 + (-6.5171222895601e-7 - 1.43417299379240e-13*o[13])*o[7]) + pi1*(-4.0516996860117e-7*o[14] + o[16]*((-1.27343017416410e-9 - 1.74248712306340e-10*o[11])*o[36] + o[19]*(-6.8762131295531e-19*o[34] + o[15]*(1.44783078285210e-20*o[32] + o[20]*(2.63357816627950e-23*o[30] + pi1*(-1.19476226400710e-23*o[28] + pi1*(1.82280945814040e-24*o[26] - 9.3537087292458e-26*o[24]*pi1))))))))) + o[8]*(-0.00047184321073267 + o[7]*(-0.000300017807930260 + (0.000047661393906987 + o[1]*(-4.4141845330846e-6 - 7.2694996297594e-16*o[9]))*tau1))) + o[5]*(0.000283190801238040 + o[1]*(-0.00060706301565874 + o[6]*(-0.0189900682184190 + tau1*(-0.032529748770505 + (-0.0218417171754140 - 0.000052838357969930*o[1])*tau1))))) + (0.146329712131670 + tau1*(-0.84548187169114 + tau1*(-3.7563603672040 + tau1*(3.3855169168385 + tau1*(-0.95791963387872 + tau1*(0.157720385132280 + (-0.0166164171995010 + 0.00081214629983568*tau1)*tau1))))))/o[1];
              g.gpi := pi1*(pi1*(o[10]*(0.000095038934535162 + o[2]*(8.4812393955936e-6 + 2.55615384360309e-9*o[6])) + pi1*(o[12]*(8.9701127632000e-6 + (2.60684891582404e-6 + 5.7366919751696e-13*o[13])*o[7]) + pi1*(2.02584984300585e-6*o[14] + o[16]*((1.01874413933128e-8 + 1.39398969845072e-9*o[11])*o[36] + o[19]*(1.44400475720615e-17*o[34] + o[15]*(-3.3300108005598e-19*o[32] + o[20]*(-7.6373766822106e-22*o[30] + pi1*(3.5842867920213e-22*o[28] + pi1*(-5.6507093202352e-23*o[26] + 2.99318679335866e-24*o[24]*pi1))))))))) + o[8]*(0.00094368642146534 + o[7]*(0.00060003561586052 + (-0.000095322787813974 + o[1]*(8.8283690661692e-6 + 1.45389992595188e-15*o[9]))*tau1))) + o[5]*(-0.000283190801238040 + o[1]*(0.00060706301565874 + o[6]*(0.0189900682184190 + tau1*(0.032529748770505 + (0.0218417171754140 + 0.000052838357969930*o[1])*tau1))));
              g.gpipi := pi1*(o[10]*(-0.000190077869070324 + o[2]*(-0.0000169624787911872 - 5.1123076872062e-9*o[6])) + pi1*(o[12]*(-0.0000269103382896000 + (-7.8205467474721e-6 - 1.72100759255088e-12*o[13])*o[7]) + pi1*(-8.1033993720234e-6*o[14] + o[16]*((-7.1312089753190e-8 - 9.7579278891550e-9*o[11])*o[36] + o[19]*(-2.88800951441230e-16*o[34] + o[15]*(7.3260237612316e-18*o[32] + o[20]*(2.13846547101895e-20*o[30] + pi1*(-1.03944316968618e-20*o[28] + pi1*(1.69521279607057e-21*o[26] - 9.2788790594118e-23*o[24]*pi1))))))))) + o[8]*(-0.00094368642146534 + o[7]*(-0.00060003561586052 + (0.000095322787813974 + o[1]*(-8.8283690661692e-6 - 1.45389992595188e-15*o[9]))*tau1));
              g.gtau := pi1*(o[38]*(-0.00254871721114236 + o[1]*(0.0042494411096112 + (0.0189900682184190 + (-0.0218417171754140 - 0.000158515073909790*o[1])*o[1])*o[6])) + pi1*(o[10]*(0.00141552963219801 + o[2]*(0.000047661393906987 + o[1]*(-0.0000132425535992538 - 1.23581493705910e-14*o[9]))) + pi1*(o[12]*(0.000126718579380216 - 5.1123076872062e-9*o[37]) + pi1*(o[39]*(0.0000112126409540000 + (1.30342445791202e-6 - 1.43417299379240e-12*o[13])*o[7]) + pi1*(3.2413597488094e-6*o[5] + o[16]*((1.40077319158051e-8 + 1.04549227383804e-9*o[11])*o[45] + o[19]*(1.99410180757040e-17*o[44] + o[15]*(-4.4882754268415e-19*o[42] + o[20]*(-1.00075970318621e-21*o[28] + pi1*(4.6595728296277e-22*o[26] + pi1*(-7.2912378325616e-23*o[24] + 3.8350205789908e-24*o[41]*pi1))))))))))) + o[8]*(-0.292659424263340 + tau1*(0.84548187169114 + o[1]*(3.3855169168385 + tau1*(-1.91583926775744 + tau1*(0.47316115539684 + (-0.066465668798004 + 0.0040607314991784*tau1)*tau1)))));
              g.gtautau := pi1*(o[36]*(0.0254871721114236 + o[1]*(-0.033995528876889 + (-0.037980136436838 - 0.00031703014781958*o[2])*o[6])) + pi1*(o[12]*(-0.0056621185287920 + o[6]*(-0.0000264851071985076 - 1.97730389929456e-13*o[9])) + pi1*((-0.00063359289690108 - 2.55615384360309e-8*o[37])*o[39] + pi1*(pi1*(-0.0000291722377392842*o[38] + o[16]*(o[19]*(-5.9823054227112e-16*o[32] + o[15]*(o[20]*(3.9029628424262e-20*o[26] + pi1*(-1.86382913185108e-20*o[24] + pi1*(2.98940751135026e-21*o[41] - (1.61070864317613e-22*pi1)/(o[1]*o[22]*o[3]*tau1)))) + 1.43624813658928e-17/(o[22]*tau1))) + (-1.68092782989661e-7 - 7.3184459168663e-9*o[11])/(o[2]*o[3]*tau1))) + (-0.000067275845724000 + (-3.9102733737361e-6 - 1.29075569441316e-11*o[13])*o[7])/(o[1]*o[2]*tau1))))) + o[10]*(0.87797827279002 + tau1*(-1.69096374338228 + o[7]*(-1.91583926775744 + tau1*(0.94632231079368 + (-0.199397006394012 + 0.0162429259967136*tau1)*tau1))));
              g.gtaupi := o[38]*(0.00254871721114236 + o[1]*(-0.0042494411096112 + (-0.0189900682184190 + (0.0218417171754140 + 0.000158515073909790*o[1])*o[1])*o[6])) + pi1*(o[10]*(-0.00283105926439602 + o[2]*(-0.000095322787813974 + o[1]*(0.0000264851071985076 + 2.47162987411820e-14*o[9]))) + pi1*(o[12]*(-0.00038015573814065 + 1.53369230616185e-8*o[37]) + pi1*(o[39]*(-0.000044850563816000 + (-5.2136978316481e-6 + 5.7366919751696e-12*o[13])*o[7]) + pi1*(-0.0000162067987440468*o[5] + o[16]*((-1.12061855326441e-7 - 8.3639381907043e-9*o[11])*o[45] + o[19]*(-4.1876137958978e-16*o[44] + o[15]*(1.03230334817355e-17*o[42] + o[20]*(2.90220313924001e-20*o[28] + pi1*(-1.39787184888831e-20*o[26] + pi1*(2.26028372809410e-21*o[24] - 1.22720658527705e-22*o[41]*pi1))))))))));
            end g1;

            function g2 "Gibbs function for region 2: g(p,T)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              input Boolean checkLimits = true "Check if inputs p,T are in region of validity";
              output Modelica.Media.Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
            protected
              Real tau2 "Dimensionless temperature";
              Real o[55] "Vector of auxiliary variables";
            algorithm
              g.p := p;
              g.T := T;
              g.R_s := data.RH2O;
              if checkLimits then
                assert(p > 0.0, "IF97 medium function g2 called with too low pressure\n" + "p = " + String(p) + " Pa <= 0.0 Pa");
                assert(p <= 100.0e6, "IF97 medium function g2: the input pressure (= " + String(p) + " Pa) is higher than 100 MPa");
                assert(T >= 273.15, "IF97 medium function g2: the temperature (= " + String(T) + " K) is lower than 273.15 K!");
                assert(T <= 1073.15, "IF97 medium function g2: the input temperature (= " + String(T) + " K) is higher than the limit of 1073.15 K");
              else
              end if;
              g.pi := p/data.PSTAR2;
              g.tau := data.TSTAR2/T;
              tau2 := -0.5 + g.tau;
              o[1] := tau2*tau2;
              o[2] := o[1]*tau2;
              o[3] := -0.050325278727930*o[2];
              o[4] := -0.057581259083432 + o[3];
              o[5] := o[4]*tau2;
              o[6] := -0.045996013696365 + o[5];
              o[7] := o[6]*tau2;
              o[8] := -0.0178348622923580 + o[7];
              o[9] := o[8]*tau2;
              o[10] := o[1]*o[1];
              o[11] := o[10]*o[10];
              o[12] := o[11]*o[11];
              o[13] := o[10]*o[11]*o[12]*tau2;
              o[14] := o[1]*o[10]*tau2;
              o[15] := o[10]*o[11]*tau2;
              o[16] := o[1]*o[12]*tau2;
              o[17] := o[1]*o[11]*tau2;
              o[18] := o[1]*o[10]*o[11];
              o[19] := o[10]*o[11]*o[12];
              o[20] := o[1]*o[10];
              o[21] := g.pi*g.pi;
              o[22] := o[21]*o[21];
              o[23] := o[21]*o[22];
              o[24] := o[10]*o[12]*tau2;
              o[25] := o[12]*o[12];
              o[26] := o[11]*o[12]*o[25]*tau2;
              o[27] := o[10]*o[12];
              o[28] := o[1]*o[10]*o[11]*tau2;
              o[29] := o[10]*o[12]*o[25]*tau2;
              o[30] := o[1]*o[10]*o[25]*tau2;
              o[31] := o[1]*o[11]*o[12];
              o[32] := o[1]*o[12];
              o[33] := g.tau*g.tau;
              o[34] := o[33]*o[33];
              o[35] := -0.000053349095828174*o[13];
              o[36] := -0.087594591301146 + o[35];
              o[37] := o[2]*o[36];
              o[38] := -0.0078785554486710 + o[37];
              o[39] := o[1]*o[38];
              o[40] := -0.00037897975032630 + o[39];
              o[41] := o[40]*tau2;
              o[42] := -0.000066065283340406 + o[41];
              o[43] := o[42]*tau2;
              o[44] := 5.7870447262208e-6*tau2;
              o[45] := -0.301951672367580*o[2];
              o[46] := -0.172743777250296 + o[45];
              o[47] := o[46]*tau2;
              o[48] := -0.091992027392730 + o[47];
              o[49] := o[48]*tau2;
              o[50] := o[1]*o[11];
              o[51] := o[10]*o[11];
              o[52] := o[11]*o[12]*o[25];
              o[53] := o[10]*o[12]*o[25];
              o[54] := o[1]*o[10]*o[25];
              o[55] := o[11]*o[12]*tau2;
              g.g := g.pi*(-0.00177317424732130 + o[9] + g.pi*(tau2*(-0.000033032641670203 + (-0.000189489875163150 + o[1]*(-0.0039392777243355 + (-0.043797295650573 - 0.0000266745479140870*o[13])*o[2]))*tau2) + g.pi*(2.04817376923090e-8 + (4.3870667284435e-7 + o[1]*(-0.000032277677238570 + (-0.00150339245421480 - 0.040668253562649*o[13])*o[2]))*tau2 + g.pi*(g.pi*(2.29220763376610e-6*o[14] + g.pi*((-1.67147664510610e-11 + o[15]*(-0.00211714723213550 - 23.8957419341040*o[16]))*o[2] + g.pi*(-5.9059564324270e-18 + o[17]*(-1.26218088991010e-6 - 0.038946842435739*o[18]) + g.pi*(o[11]*(1.12562113604590e-11 - 8.2311340897998*o[19]) + g.pi*(1.98097128020880e-8*o[15] + g.pi*(o[10]*(1.04069652101740e-19 + (-1.02347470959290e-13 - 1.00181793795110e-9*o[10])*o[20]) + o[23]*(o[13]*(-8.0882908646985e-11 + 0.106930318794090*o[24]) + o[21]*(-0.33662250574171*o[26] + o[21]*(o[27]*(8.9185845355421e-25 + (3.06293168762320e-13 - 4.2002467698208e-6*o[15])*o[28]) + g.pi*(-5.9056029685639e-26*o[24] + g.pi*(3.7826947613457e-6*o[29] + g.pi*(-1.27686089346810e-15*o[30] + o[31]*(7.3087610595061e-29 + o[18]*(5.5414715350778e-17 - 9.4369707241210e-7*o[32]))*g.pi)))))))))))) + tau2*(-7.8847309559367e-10 + (1.27907178522850e-8 + 4.8225372718507e-7*tau2)*tau2))))) + (-0.0056087911830200 + g.tau*(0.071452738814550 + g.tau*(-0.40710498239280 + g.tau*(1.42408197144400 + g.tau*(-4.3839511194500 + g.tau*(-9.6927686002170 + g.tau*(10.0866556801800 + (-0.284086326077200 + 0.0212684635330700*g.tau)*g.tau) + Modelica.Math.log(g.pi)))))))/(o[34]*g.tau);
              g.gpi := (1.00000000000000 + g.pi*(-0.00177317424732130 + o[9] + g.pi*(o[43] + g.pi*(6.1445213076927e-8 + (1.31612001853305e-6 + o[1]*(-0.000096833031715710 + (-0.0045101773626444 - 0.122004760687947*o[13])*o[2]))*tau2 + g.pi*(g.pi*(0.0000114610381688305*o[14] + g.pi*((-1.00288598706366e-10 + o[15]*(-0.0127028833928130 - 143.374451604624*o[16]))*o[2] + g.pi*(-4.1341695026989e-17 + o[17]*(-8.8352662293707e-6 - 0.272627897050173*o[18]) + g.pi*(o[11]*(9.0049690883672e-11 - 65.849072718398*o[19]) + g.pi*(1.78287415218792e-7*o[15] + g.pi*(o[10]*(1.04069652101740e-18 + (-1.02347470959290e-12 - 1.00181793795110e-8*o[10])*o[20]) + o[23]*(o[13]*(-1.29412653835176e-9 + 1.71088510070544*o[24]) + o[21]*(-6.0592051033508*o[26] + o[21]*(o[27]*(1.78371690710842e-23 + (6.1258633752464e-12 - 0.000084004935396416*o[15])*o[28]) + g.pi*(-1.24017662339842e-24*o[24] + g.pi*(0.000083219284749605*o[29] + g.pi*(-2.93678005497663e-14*o[30] + o[31]*(1.75410265428146e-27 + o[18]*(1.32995316841867e-15 - 0.0000226487297378904*o[32]))*g.pi)))))))))))) + tau2*(-3.15389238237468e-9 + (5.1162871409140e-8 + 1.92901490874028e-6*tau2)*tau2))))))/g.pi;
              g.gpipi := (-1.00000000000000 + o[21]*(o[43] + g.pi*(1.22890426153854e-7 + (2.63224003706610e-6 + o[1]*(-0.000193666063431420 + (-0.0090203547252888 - 0.244009521375894*o[13])*o[2]))*tau2 + g.pi*(g.pi*(0.000045844152675322*o[14] + g.pi*((-5.0144299353183e-10 + o[15]*(-0.063514416964065 - 716.87225802312*o[16]))*o[2] + g.pi*(-2.48050170161934e-16 + o[17]*(-0.000053011597376224 - 1.63576738230104*o[18]) + g.pi*(o[11]*(6.3034783618570e-10 - 460.94350902879*o[19]) + g.pi*(1.42629932175034e-6*o[15] + g.pi*(o[10]*(9.3662686891566e-18 + (-9.2112723863361e-12 - 9.0163614415599e-8*o[10])*o[20]) + o[23]*(o[13]*(-1.94118980752764e-8 + 25.6632765105816*o[24]) + o[21]*(-103.006486756963*o[26] + o[21]*(o[27]*(3.3890621235060e-22 + (1.16391404129682e-10 - 0.00159609377253190*o[15])*o[28]) + g.pi*(-2.48035324679684e-23*o[24] + g.pi*(0.00174760497974171*o[29] + g.pi*(-6.4609161209486e-13*o[30] + o[31]*(4.0344361048474e-26 + o[18]*(3.05889228736295e-14 - 0.00052092078397148*o[32]))*g.pi)))))))))))) + tau2*(-9.4616771471240e-9 + (1.53488614227420e-7 + o[44])*tau2)))))/o[21];
              g.gtau := (0.0280439559151000 + g.tau*(-0.285810955258200 + g.tau*(1.22131494717840 + g.tau*(-2.84816394288800 + g.tau*(4.3839511194500 + o[33]*(10.0866556801800 + (-0.56817265215440 + 0.063805390599210*g.tau)*g.tau))))))/(o[33]*o[34]) + g.pi*(-0.0178348622923580 + o[49] + g.pi*(-0.000033032641670203 + (-0.00037897975032630 + o[1]*(-0.0157571108973420 + (-0.306581069554011 - 0.00096028372490713*o[13])*o[2]))*tau2 + g.pi*(4.3870667284435e-7 + o[1]*(-0.000096833031715710 + (-0.0090203547252888 - 1.42338887469272*o[13])*o[2]) + g.pi*(-7.8847309559367e-10 + g.pi*(0.0000160454534363627*o[20] + g.pi*(o[1]*(-5.0144299353183e-11 + o[15]*(-0.033874355714168 - 836.35096769364*o[16])) + g.pi*((-0.0000138839897890111 - 0.97367106089347*o[18])*o[50] + g.pi*(o[14]*(9.0049690883672e-11 - 296.320827232793*o[19]) + g.pi*(2.57526266427144e-7*o[51] + g.pi*(o[2]*(4.1627860840696e-19 + (-1.02347470959290e-12 - 1.40254511313154e-8*o[10])*o[20]) + o[23]*(o[19]*(-2.34560435076256e-9 + 5.3465159397045*o[24]) + o[21]*(-19.1874828272775*o[52] + o[21]*(o[16]*(1.78371690710842e-23 + (1.07202609066812e-11 - 0.000201611844951398*o[15])*o[28]) + g.pi*(-1.24017662339842e-24*o[27] + g.pi*(0.000200482822351322*o[53] + g.pi*(-4.9797574845256e-14*o[54] + (1.90027787547159e-27 + o[18]*(2.21658861403112e-15 - 0.000054734430199902*o[32]))*o[55]*g.pi)))))))))))) + (2.55814357045700e-8 + 1.44676118155521e-6*tau2)*tau2))));
              g.gtautau := (-0.168263735490600 + g.tau*(1.42905477629100 + g.tau*(-4.8852597887136 + g.tau*(8.5444918286640 + g.tau*(-8.7679022389000 + o[33]*(-0.56817265215440 + 0.127610781198420*g.tau)*g.tau)))))/(o[33]*o[34]*g.tau) + g.pi*(-0.091992027392730 + (-0.34548755450059 - 1.50975836183790*o[2])*tau2 + g.pi*(-0.00037897975032630 + o[1]*(-0.047271332692026 + (-1.83948641732407 - 0.033609930371750*o[13])*o[2]) + g.pi*((-0.000193666063431420 + (-0.045101773626444 - 48.395221739552*o[13])*o[2])*tau2 + g.pi*(2.55814357045700e-8 + 2.89352236311042e-6*tau2 + g.pi*(0.000096272720618176*o[10]*tau2 + g.pi*((-1.00288598706366e-10 + o[15]*(-0.50811533571252 - 28435.9329015838*o[16]))*tau2 + g.pi*(o[11]*(-0.000138839897890111 - 23.3681054614434*o[18])*tau2 + g.pi*((6.3034783618570e-10 - 10371.2289531477*o[19])*o[20] + g.pi*(3.09031519712573e-6*o[17] + g.pi*(o[1]*(1.24883582522088e-18 + (-9.2112723863361e-12 - 1.82330864707100e-7*o[10])*o[20]) + o[23]*(o[1]*o[11]*o[12]*(-6.5676921821352e-8 + 261.979281045521*o[24])*tau2 + o[21]*(-1074.49903832754*o[1]*o[10]*o[12]*o[25]*tau2 + o[21]*((3.3890621235060e-22 + (3.6448887082716e-10 - 0.0094757567127157*o[15])*o[28])*o[32] + g.pi*(-2.48035324679684e-23*o[16] + g.pi*(0.0104251067622687*o[1]*o[12]*o[25]*tau2 + g.pi*(o[11]*o[12]*(4.7506946886790e-26 + o[18]*(8.6446955947214e-14 - 0.00311986252139440*o[32]))*g.pi - 1.89230784411972e-12*o[10]*o[25]*tau2))))))))))))))));
              g.gtaupi := -0.0178348622923580 + o[49] + g.pi*(-0.000066065283340406 + (-0.00075795950065260 + o[1]*(-0.0315142217946840 + (-0.61316213910802 - 0.00192056744981426*o[13])*o[2]))*tau2 + g.pi*(1.31612001853305e-6 + o[1]*(-0.000290499095147130 + (-0.0270610641758664 - 4.2701666240781*o[13])*o[2]) + g.pi*(-3.15389238237468e-9 + g.pi*(0.000080227267181813*o[20] + g.pi*(o[1]*(-3.00865796119098e-10 + o[15]*(-0.203246134285008 - 5018.1058061618*o[16])) + g.pi*((-0.000097187928523078 - 6.8156974262543*o[18])*o[50] + g.pi*(o[14]*(7.2039752706938e-10 - 2370.56661786234*o[19]) + g.pi*(2.31773639784430e-6*o[51] + g.pi*(o[2]*(4.1627860840696e-18 + (-1.02347470959290e-11 - 1.40254511313154e-7*o[10])*o[20]) + o[23]*(o[19]*(-3.7529669612201e-8 + 85.544255035272*o[24]) + o[21]*(-345.37469089099*o[52] + o[21]*(o[16]*(3.5674338142168e-22 + (2.14405218133624e-10 - 0.0040322368990280*o[15])*o[28]) + g.pi*(-2.60437090913668e-23*o[27] + g.pi*(0.0044106220917291*o[53] + g.pi*(-1.14534422144089e-12*o[54] + (4.5606669011318e-26 + o[18]*(5.3198126736747e-14 - 0.00131362632479764*o[32]))*o[55]*g.pi)))))))))))) + (1.02325742818280e-7 + o[44])*tau2)));
            end g2;

            function f3 "Helmholtz function for region 3: f(d,T)"
              extends Modelica.Icons.Function;
              input SI.Density d "Density";
              input SI.Temperature T "Temperature (K)";
              output Modelica.Media.Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
            protected
              Real o[40] "Vector of auxiliary variables";
            algorithm
              f.T := T;
              f.d := d;
              f.R_s := data.RH2O;
              f.tau := data.TCRIT/T;
              f.delta := if (d == data.DCRIT and T == data.TCRIT) then 1 - Modelica.Constants.eps else abs(d/data.DCRIT);
              o[1] := f.tau*f.tau;
              o[2] := o[1]*o[1];
              o[3] := o[2]*f.tau;
              o[4] := o[1]*f.tau;
              o[5] := o[2]*o[2];
              o[6] := o[1]*o[5]*f.tau;
              o[7] := o[5]*f.tau;
              o[8] := -0.64207765181607*o[1];
              o[9] := 0.88521043984318 + o[8];
              o[10] := o[7]*o[9];
              o[11] := -1.15244078066810 + o[10];
              o[12] := o[11]*o[2];
              o[13] := -1.26543154777140 + o[12];
              o[14] := o[1]*o[13];
              o[15] := o[1]*o[2]*o[5]*f.tau;
              o[16] := o[2]*o[5];
              o[17] := o[1]*o[5];
              o[18] := o[5]*o[5];
              o[19] := o[1]*o[18]*o[2];
              o[20] := o[1]*o[18]*o[2]*f.tau;
              o[21] := o[18]*o[5];
              o[22] := o[1]*o[18]*o[5];
              o[23] := 0.251168168486160*o[2];
              o[24] := 0.078841073758308 + o[23];
              o[25] := o[15]*o[24];
              o[26] := -6.1005234513930 + o[25];
              o[27] := o[26]*f.tau;
              o[28] := 9.7944563083754 + o[27];
              o[29] := o[2]*o[28];
              o[30] := -1.70429417648412 + o[29];
              o[31] := o[1]*o[30];
              o[32] := f.delta*f.delta;
              o[33] := -10.9153200808732*o[1];
              o[34] := 13.2781565976477 + o[33];
              o[35] := o[34]*o[7];
              o[36] := -6.9146446840086 + o[35];
              o[37] := o[2]*o[36];
              o[38] := -2.53086309554280 + o[37];
              o[39] := o[38]*f.tau;
              o[40] := o[18]*o[5]*f.tau;
              f.f := -15.7328452902390 + f.tau*(20.9443969743070 + (-7.6867707878716 + o[3]*(2.61859477879540 + o[4]*(-2.80807811486200 + o[1]*(1.20533696965170 - 0.0084566812812502*o[6]))))*f.tau) + f.delta*(o[14] + f.delta*(0.38493460186671 + o[1]*(-0.85214708824206 + o[2]*(4.8972281541877 + (-3.05026172569650 + o[15]*(0.039420536879154 + 0.125584084243080*o[2]))*f.tau)) + f.delta*(-0.279993296987100 + o[1]*(1.38997995694600 + o[1]*(-2.01899150235700 + o[16]*(-0.0082147637173963 - 0.47596035734923*o[17]))) + f.delta*(0.043984074473500 + o[1]*(-0.44476435428739 + o[1]*(0.90572070719733 + 0.70522450087967*o[19])) + f.delta*(f.delta*(-0.0221754008730960 + o[1]*(0.094260751665092 + 0.164362784479610*o[21]) + f.delta*(-0.0135033722413480*o[1] + f.delta*(-0.0148343453524720*o[22] + f.delta*(o[1]*(0.00057922953628084 + 0.0032308904703711*o[21]) + f.delta*(0.000080964802996215 - 0.000044923899061815*f.delta*o[22] - 0.000165576797950370*f.tau))))) + (0.107705126263320 + o[1]*(-0.32913623258954 - 0.50871062041158*o[20]))*f.tau))))) + 1.06580700285130*Modelica.Math.log(f.delta);
              f.fdelta := (1.06580700285130 + f.delta*(o[14] + f.delta*(0.76986920373342 + o[31] + f.delta*(-0.83997989096130 + o[1]*(4.1699398708380 + o[1]*(-6.0569745070710 + o[16]*(-0.0246442911521889 - 1.42788107204769*o[17]))) + f.delta*(0.175936297894000 + o[1]*(-1.77905741714956 + o[1]*(3.6228828287893 + 2.82089800351868*o[19])) + f.delta*(f.delta*(-0.133052405238576 + o[1]*(0.56556450999055 + 0.98617670687766*o[21]) + f.delta*(-0.094523605689436*o[1] + f.delta*(-0.118674762819776*o[22] + f.delta*(o[1]*(0.0052130658265276 + 0.0290780142333399*o[21]) + f.delta*(0.00080964802996215 - 0.00049416288967996*f.delta*o[22] - 0.00165576797950370*f.tau))))) + (0.53852563131660 + o[1]*(-1.64568116294770 - 2.54355310205790*o[20]))*f.tau))))))/f.delta;
              f.fdeltadelta := (-1.06580700285130 + o[32]*(0.76986920373342 + o[31] + f.delta*(-1.67995978192260 + o[1]*(8.3398797416760 + o[1]*(-12.1139490141420 + o[16]*(-0.049288582304378 - 2.85576214409538*o[17]))) + f.delta*(0.52780889368200 + o[1]*(-5.3371722514487 + o[1]*(10.8686484863680 + 8.4626940105560*o[19])) + f.delta*(f.delta*(-0.66526202619288 + o[1]*(2.82782254995276 + 4.9308835343883*o[21]) + f.delta*(-0.56714163413662*o[1] + f.delta*(-0.83072333973843*o[22] + f.delta*(o[1]*(0.041704526612220 + 0.232624113866719*o[21]) + f.delta*(0.0072868322696594 - 0.0049416288967996*f.delta*o[22] - 0.0149019118155333*f.tau))))) + (2.15410252526640 + o[1]*(-6.5827246517908 - 10.1742124082316*o[20]))*f.tau)))))/o[32];
              f.ftau := 20.9443969743070 + (-15.3735415757432 + o[3]*(18.3301634515678 + o[4]*(-28.0807811486200 + o[1]*(14.4640436358204 - 0.194503669468755*o[6]))))*f.tau + f.delta*(o[39] + f.delta*(f.tau*(-1.70429417648412 + o[2]*(29.3833689251262 + (-21.3518320798755 + o[15]*(0.86725181134139 + 3.2651861903201*o[2]))*f.tau)) + f.delta*((2.77995991389200 + o[1]*(-8.0759660094280 + o[16]*(-0.131436219478341 - 12.3749692910800*o[17])))*f.tau + f.delta*((-0.88952870857478 + o[1]*(3.6228828287893 + 18.3358370228714*o[19]))*f.tau + f.delta*(0.107705126263320 + o[1]*(-0.98740869776862 - 13.2264761307011*o[20]) + f.delta*((0.188521503330184 + 4.2734323964699*o[21])*f.tau + f.delta*(-0.0270067444826960*f.tau + f.delta*(-0.38569297916427*o[40] + f.delta*(f.delta*(-0.000165576797950370 - 0.00116802137560719*f.delta*o[40]) + (0.00115845907256168 + 0.084003152229649*o[21])*f.tau)))))))));
              f.ftautau := -15.3735415757432 + o[3]*(109.980980709407 + o[4]*(-252.727030337580 + o[1]*(159.104479994024 - 4.2790807283126*o[6]))) + f.delta*(-2.53086309554280 + o[2]*(-34.573223420043 + (185.894192367068 - 174.645121293971*o[1])*o[7]) + f.delta*(-1.70429417648412 + o[2]*(146.916844625631 + (-128.110992479253 + o[15]*(18.2122880381691 + 81.629654758002*o[2]))*f.tau) + f.delta*(2.77995991389200 + o[1]*(-24.2278980282840 + o[16]*(-1.97154329217511 - 309.374232277000*o[17])) + f.delta*(-0.88952870857478 + o[1]*(10.8686484863680 + 458.39592557179*o[19]) + f.delta*(f.delta*(0.188521503330184 + 106.835809911747*o[21] + f.delta*(-0.0270067444826960 + f.delta*(-9.6423244791068*o[21] + f.delta*(0.00115845907256168 + 2.10007880574121*o[21] - 0.0292005343901797*o[21]*o[32])))) + (-1.97481739553724 - 330.66190326753*o[20])*f.tau)))));
              f.fdeltatau := o[39] + f.delta*(f.tau*(-3.4085883529682 + o[2]*(58.766737850252 + (-42.703664159751 + o[15]*(1.73450362268278 + 6.5303723806402*o[2]))*f.tau)) + f.delta*((8.3398797416760 + o[1]*(-24.2278980282840 + o[16]*(-0.39430865843502 - 37.124907873240*o[17])))*f.tau + f.delta*((-3.5581148342991 + o[1]*(14.4915313151573 + 73.343348091486*o[19]))*f.tau + f.delta*(0.53852563131660 + o[1]*(-4.9370434888431 - 66.132380653505*o[20]) + f.delta*((1.13112901998110 + 25.6405943788192*o[21])*f.tau + f.delta*(-0.189047211378872*f.tau + f.delta*(-3.08554383331418*o[40] + f.delta*(f.delta*(-0.00165576797950370 - 0.0128482351316791*f.delta*o[40]) + (0.0104261316530551 + 0.75602837006684*o[21])*f.tau))))))));
            end f3;

            function g5 "Base function for region 5: g(p,T)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output Modelica.Media.Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
            protected
              Real o[11] "Vector of auxiliary variables";
            algorithm
              assert(p > 0.0, "IF97 medium function g5 called with too low pressure\n" + "p = " + String(p) + " Pa <=  0.0 Pa");
              assert(p <= data.PLIMIT5, "IF97 medium function g5: input pressure (= " + String(p) + " Pa) is higher than 10 MPa in region 5");
              assert(T <= 2273.15, "IF97 medium function g5: input temperature (= " + String(T) + " K) is higher than limit of 2273.15K in region 5");
              g.p := p;
              g.T := T;
              g.R_s := data.RH2O;
              g.pi := p/data.PSTAR5;
              g.tau := data.TSTAR5/T;
              o[1] := g.tau*g.tau;
              o[2] := -0.0045942820899910*o[1];
              o[3] := 0.00217746787145710 + o[2];
              o[4] := o[3]*g.tau;
              o[5] := o[1]*g.tau;
              o[6] := o[1]*o[1];
              o[7] := o[6]*o[6];
              o[8] := o[7]*g.tau;
              o[9] := -7.9449656719138e-6*o[8];
              o[10] := g.pi*g.pi;
              o[11] := -0.0137828462699730*o[1];
              g.g := g.pi*(-0.000125631835895920 + o[4] + g.pi*(-3.9724828359569e-6*o[8] + 1.29192282897840e-7*o[5]*g.pi)) + (-0.0248051489334660 + g.tau*(0.36901534980333 + g.tau*(-3.11613182139250 + g.tau*(-13.1799836742010 + (6.8540841634434 - 0.32961626538917*g.tau)*g.tau + Modelica.Math.log(g.pi)))))/o[5];
              g.gpi := (1.0 + g.pi*(-0.000125631835895920 + o[4] + g.pi*(o[9] + 3.8757684869352e-7*o[5]*g.pi)))/g.pi;
              g.gpipi := (-1.00000000000000 + o[10]*(o[9] + 7.7515369738704e-7*o[5]*g.pi))/o[10];
              g.gtau := g.pi*(0.00217746787145710 + o[11] + g.pi*(-0.000035752345523612*o[7] + 3.8757684869352e-7*o[1]*g.pi)) + (0.074415446800398 + g.tau*(-0.73803069960666 + (3.11613182139250 + o[1]*(6.8540841634434 - 0.65923253077834*g.tau))*g.tau))/o[6];
              g.gtautau := (-0.297661787201592 + g.tau*(2.21409209881998 + (-6.2322636427850 - 0.65923253077834*o[5])*g.tau))/(o[6]*g.tau) + g.pi*(-0.0275656925399460*g.tau + g.pi*(-0.000286018764188897*o[1]*o[6]*g.tau + 7.7515369738704e-7*g.pi*g.tau));
              g.gtaupi := 0.00217746787145710 + o[11] + g.pi*(-0.000071504691047224*o[7] + 1.16273054608056e-6*o[1]*g.pi);
            end g5;

            function tph1 "Inverse function for region 1: T(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.Temperature T "Temperature (K)";
            protected
              Real pi "Dimensionless pressure";
              Real eta1 "Dimensionless specific enthalpy";
              Real o[3] "Vector of auxiliary variables";
            algorithm
              assert(p > triple.ptriple, "IF97 medium function tph1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              pi := p/data.PSTAR2;
              eta1 := h/data.HSTAR1 + 1.0;
              o[1] := eta1*eta1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              T := -238.724899245210 - 13.3917448726020*pi + eta1*(404.21188637945 + 43.211039183559*pi + eta1*(113.497468817180 - 54.010067170506*pi + eta1*(30.5358922039160*pi + eta1*(-6.5964749423638*pi + o[1]*(-5.8457616048039 + o[2]*(pi*(0.0093965400878363 + (-0.0000258586412820730 + 6.6456186191635e-8*pi)*pi) + o[2]*o[3]*(-0.000152854824131400 + o[1]*o[3]*(-1.08667076953770e-6 + pi*(1.15736475053400e-7 + pi*(-4.0644363084799e-9 + pi*(8.0670734103027e-11 + pi*(-9.3477771213947e-13 + (5.8265442020601e-15 - 1.50201859535030e-17*pi)*pi))))))))))));
            end tph1;

            function tps1 "Inverse function for region 1: T(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.Temperature T "Temperature (K)";
            protected
              constant SI.Pressure pstar = 1.0e6;
              constant SI.SpecificEntropy sstar = 1.0e3;
              Real pi "Dimensionless pressure";
              Real sigma1 "Dimensionless specific entropy";
              Real o[6] "Vector of auxiliary variables";
            algorithm
              pi := p/pstar;
              assert(p > triple.ptriple, "IF97 medium function tps1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              sigma1 := s/sstar + 2.0;
              o[1] := sigma1*sigma1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              o[4] := o[3]*o[3];
              o[5] := o[4]*o[4];
              o[6] := o[1]*o[2]*o[4];
              T := 174.782680583070 + sigma1*(34.806930892873 + sigma1*(6.5292584978455 + (0.33039981775489 + o[3]*(-1.92813829231960e-7 - 2.49091972445730e-23*o[2]*o[4]))*sigma1)) + pi*(-0.261076364893320 + pi*(0.00056608900654837 + pi*(o[1]*o[3]*(2.64004413606890e-13 + 7.8124600459723e-29*o[6]) - 3.07321999036680e-31*o[5]*pi) + sigma1*(-0.00032635483139717 + sigma1*(0.000044778286690632 + o[1]*o[2]*(-5.1322156908507e-10 - 4.2522657042207e-26*o[6])*sigma1))) + sigma1*(0.225929659815860 + sigma1*(-0.064256463395226 + sigma1*(0.0078876289270526 + o[3]*sigma1*(3.5672110607366e-10 + 1.73324969948950e-24*o[1]*o[4]*sigma1)))));
            end tps1;

            function tph2 "Reverse function for region 2: T(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.Temperature T "Temperature (K)";
            protected
              Real pi "Dimensionless pressure";
              Real pi2b "Dimensionless pressure";
              Real pi2c "Dimensionless pressure";
              Real eta "Dimensionless specific enthalpy";
              Real etabc "Dimensionless specific enthalpy";
              Real eta2a "Dimensionless specific enthalpy";
              Real eta2b "Dimensionless specific enthalpy";
              Real eta2c "Dimensionless specific enthalpy";
              Real o[8] "Vector of auxiliary variables";
            algorithm
              pi := p*data.IPSTAR;
              eta := h*data.IHSTAR;
              etabc := h*1.0e-3;
              if (pi < 4.0) then
                eta2a := eta - 2.1;
                o[1] := eta2a*eta2a;
                o[2] := o[1]*o[1];
                o[3] := pi*pi;
                o[4] := o[3]*o[3];
                o[5] := o[3]*pi;
                T := 1089.89523182880 + (1.84457493557900 - 0.0061707422868339*pi)*pi + eta2a*(849.51654495535 - 4.1792700549624*pi + eta2a*(-107.817480918260 + (6.2478196935812 - 0.310780466295830*pi)*pi + eta2a*(33.153654801263 - 17.3445631081140*pi + o[2]*(-7.4232016790248 + pi*(-200.581768620960 + 11.6708730771070*pi) + o[1]*(271.960654737960*pi + o[1]*(-455.11318285818*pi + eta2a*(1.38657242832260*o[4] + o[1]*o[2]*(3091.96886047550*pi + o[1]*(11.7650487243560 + o[2]*(-13551.3342407750*o[5] + o[2]*(-62.459855192507*o[3]*o[4]*pi + o[2]*(o[4]*(235988.325565140 + 7399.9835474766*pi) + o[1]*(19127.7292396600*o[3]*o[4] + o[1]*(o[3]*(1.28127984040460e8 - 551966.97030060*o[5]) + o[1]*(-9.8554909623276e8*o[3] + o[1]*(2.82245469730020e9*o[3] + o[1]*(o[3]*(-3.5948971410703e9 + 3.7154085996233e6*o[5]) + o[1]*pi*(252266.403578720 + pi*(1.72273499131970e9 + pi*(1.28487346646500e7 + (-1.31052365450540e7 - 415351.64835634*o[3])*pi))))))))))))))))))));
              elseif (pi < (0.12809002730136e-03*etabc - 0.67955786399241)*etabc + 0.90584278514723e3) then
                eta2b := eta - 2.6;
                pi2b := pi - 2.0;
                o[1] := pi2b*pi2b;
                o[2] := o[1]*pi2b;
                o[3] := o[1]*o[1];
                o[4] := eta2b*eta2b;
                o[5] := o[4]*o[4];
                o[6] := o[4]*o[5];
                o[7] := o[5]*o[5];
                T := 1489.50410795160 + 0.93747147377932*pi2b + eta2b*(743.07798314034 + o[2]*(0.000110328317899990 - 1.75652339694070e-18*o[1]*o[3]) + eta2b*(-97.708318797837 + pi2b*(3.3593118604916 + pi2b*(-0.0218107553247610 + pi2b*(0.000189552483879020 + (2.86402374774560e-7 - 8.1456365207833e-14*o[2])*pi2b))) + o[5]*(3.3809355601454*pi2b + o[4]*(-0.108297844036770*o[1] + o[5]*(2.47424647056740 + (0.168445396719040 + o[1]*(0.00308915411605370 - 0.0000107798573575120*pi2b))*pi2b + o[6]*(-0.63281320016026 + pi2b*(0.73875745236695 + (-0.046333324635812 + o[1]*(-0.000076462712454814 + 2.82172816350400e-7*pi2b))*pi2b) + o[6]*(1.13859521296580 + pi2b*(-0.47128737436186 + o[1]*(0.00135555045549490 + (0.0000140523928183160 + 1.27049022719450e-6*pi2b)*pi2b)) + o[5]*(-0.47811863648625 + (0.150202731397070 + o[2]*(-0.0000310838143314340 + o[1]*(-1.10301392389090e-8 - 2.51805456829620e-11*pi2b)))*pi2b + o[5]*o[7]*(0.0085208123431544 + pi2b*(-0.00217641142197500 + pi2b*(0.000071280351959551 + o[1]*(-1.03027382121030e-6 + (7.3803353468292e-8 + 8.6934156344163e-15*o[3])*pi2b))))))))))));
              else
                eta2c := eta - 1.8;
                pi2c := pi + 25.0;
                o[1] := pi2c*pi2c;
                o[2] := o[1]*o[1];
                o[3] := o[1]*o[2]*pi2c;
                o[4] := 1/o[3];
                o[5] := o[1]*o[2];
                o[6] := eta2c*eta2c;
                o[7] := o[2]*o[2];
                o[8] := o[6]*o[6];
                T := eta2c*((859777.22535580 + o[1]*(482.19755109255 + 1.12615974072300e-12*o[5]))/o[1] + eta2c*((-5.8340131851590e11 + (2.08255445631710e10 + 31081.0884227140*o[2])*pi2c)/o[5] + o[6]*(o[8]*(o[6]*(1.23245796908320e-7*o[5] + o[6]*(-1.16069211309840e-6*o[5] + o[8]*(0.0000278463670885540*o[5] + (-0.00059270038474176*o[5] + 0.00129185829918780*o[5]*o[6])*o[8]))) - 10.8429848800770*pi2c) + o[4]*(7.3263350902181e12 + o[7]*(3.7966001272486 + (-0.045364172676660 - 1.78049822406860e-11*o[2])*pi2c))))) + o[4]*(-3.2368398555242e12 + pi2c*(3.5825089945447e11 + pi2c*(-1.07830682174700e10 + o[1]*pi2c*(610747.83564516 + pi2c*(-25745.7236041700 + (1208.23158659360 + 1.45591156586980e-13*o[5])*pi2c)))));
              end if;
            end tph2;

            function tps2a "Reverse function for region 2a: T(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.Temperature T "Temperature (K)";
            protected
              Real o[12] "Vector of auxiliary variables";
              constant Real IPSTAR = 1.0e-6 "Scaling variable";
              constant Real ISSTAR2A = 1/2000.0 "Scaling variable";
              Real pi "Dimensionless pressure";
              Real sigma2a "Dimensionless specific entropy";
            algorithm
              pi := p*IPSTAR;
              sigma2a := s*ISSTAR2A - 2.0;
              o[1] := pi^0.5;
              o[2] := sigma2a*sigma2a;
              o[3] := o[2]*o[2];
              o[4] := o[3]*o[3];
              o[5] := o[4]*o[4];
              o[6] := pi^0.25;
              o[7] := o[2]*o[4]*o[5];
              o[8] := 1/o[7];
              o[9] := o[3]*sigma2a;
              o[10] := o[2]*o[3]*sigma2a;
              o[11] := o[3]*o[4]*sigma2a;
              o[12] := o[2]*sigma2a;
              T := ((-392359.83861984 + (515265.73827270 + o[3]*(40482.443161048 + o[2]*o[3]*(-321.93790923902 + o[2]*(96.961424218694 - 22.8678463717730*sigma2a))))*sigma2a)/(o[4]*o[5]) + o[6]*((-449429.14124357 + o[3]*(-5011.8336020166 + 0.35684463560015*o[4]*sigma2a))/(o[2]*o[5]*sigma2a) + o[6]*(o[8]*(44235.335848190 + o[9]*(-13673.3888117080 + o[3]*(421632.60207864 + (22516.9258374750 + o[10]*(474.42144865646 - 149.311307976470*sigma2a))*sigma2a))) + o[6]*((-197811.263204520 - 23554.3994707600*sigma2a)/(o[2]*o[3]*o[4]*sigma2a) + o[6]*((-19070.6163020760 + o[11]*(55375.669883164 + (3829.3691437363 - 603.91860580567*o[2])*o[3]))*o[8] + o[6]*((1936.31026203310 + o[2]*(4266.0643698610 + o[2]*o[3]*o[4]*(-5978.0638872718 - 704.01463926862*o[9])))/(o[2]*o[4]*o[5]*sigma2a) + o[1]*((338.36784107553 + o[12]*(20.8627866351870 + (0.033834172656196 - 0.000043124428414893*o[12])*o[3]))*sigma2a + o[6]*(166.537913564120 + sigma2a*(-139.862920558980 + o[3]*(-0.78849547999872 + (0.072132411753872 + o[3]*(-0.0059754839398283 + (-0.0000121413589539040 + 2.32270967338710e-7*o[2])*o[3]))*sigma2a)) + o[6]*(-10.5384635661940 + o[3]*(2.07189254965020 + (-0.072193155260427 + 2.07498870811200e-7*o[4])*o[9]) + o[6]*(o[6]*(o[12]*(0.210375278936190 + 0.000256812397299990*o[3]*o[4]) + (-0.0127990029337810 - 8.2198102652018e-6*o[11])*o[6]*o[9]) + o[10]*(-0.0183406579113790 + 2.90362723486960e-7*o[2]*o[4]*sigma2a)))))))))))/(o[1]*pi);
            end tps2a;

            function tps2b "Reverse function for region 2b: T(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.Temperature T "Temperature (K)";
            protected
              Real o[8] "Vector of auxiliary variables";
              constant Real IPSTAR = 1.0e-6 "Scaling variable";
              constant Real ISSTAR2B = 1/785.3 "Scaling variable";
              Real pi "Dimensionless pressure";
              Real sigma2b "Dimensionless specific entropy";
            algorithm
              pi := p*IPSTAR;
              sigma2b := 10.0 - s*ISSTAR2B;
              o[1] := pi*pi;
              o[2] := o[1]*o[1];
              o[3] := sigma2b*sigma2b;
              o[4] := o[3]*o[3];
              o[5] := o[4]*o[4];
              o[6] := o[3]*o[5]*sigma2b;
              o[7] := o[3]*o[5];
              o[8] := o[3]*sigma2b;
              T := (316876.65083497 + 20.8641758818580*o[6] + pi*(-398593.99803599 - 21.8160585188770*o[6] + pi*(223697.851942420 + (-2784.17034458170 + 9.9207436071480*o[7])*sigma2b + pi*(-75197.512299157 + (2970.86059511580 + o[7]*(-3.4406878548526 + 0.38815564249115*sigma2b))*sigma2b + pi*(17511.2950857500 + sigma2b*(-1423.71128544490 + (1.09438033641670 + 0.89971619308495*o[4])*o[4]*sigma2b) + pi*(-3375.9740098958 + (471.62885818355 + o[4]*(-1.91882419936790 + o[8]*(0.41078580492196 - 0.33465378172097*sigma2b)))*sigma2b + pi*(1387.00347775050 + sigma2b*(-406.63326195838 + sigma2b*(41.727347159610 + o[3]*(2.19325494345320 + sigma2b*(-1.03200500090770 + (0.35882943516703 + 0.0052511453726066*o[8])*sigma2b)))) + pi*(12.8389164507050 + sigma2b*(-2.86424372193810 + sigma2b*(0.56912683664855 + (-0.099962954584931 + o[4]*(-0.0032632037778459 + 0.000233209225767230*sigma2b))*sigma2b)) + pi*(-0.153348098574500 + (0.0290722882399020 + 0.00037534702741167*o[4])*sigma2b + pi*(0.00172966917024110 + (-0.00038556050844504 - 0.000035017712292608*o[3])*sigma2b + pi*(-0.0000145663936314920 + 5.6420857267269e-6*sigma2b + pi*(4.1286150074605e-8 + (-2.06846711188240e-8 + 1.64093936747250e-9*sigma2b)*sigma2b))))))))))))/(o[1]*o[2]);
            end tps2b;

            function tps2c "Reverse function for region 2c: T(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.Temperature T "Temperature (K)";
            protected
              constant Real IPSTAR = 1.0e-6 "Scaling variable";
              constant Real ISSTAR2C = 1/2925.1 "Scaling variable";
              Real pi "Dimensionless pressure";
              Real sigma2c "Dimensionless specific entropy";
              Real o[3] "Vector of auxiliary variables";
            algorithm
              pi := p*IPSTAR;
              sigma2c := 2.0 - s*ISSTAR2C;
              o[1] := pi*pi;
              o[2] := sigma2c*sigma2c;
              o[3] := o[2]*o[2];
              T := (909.68501005365 + 2404.56670884200*sigma2c + pi*(-591.62326387130 + pi*(541.45404128074 + sigma2c*(-270.983084111920 + (979.76525097926 - 469.66772959435*sigma2c)*sigma2c) + pi*(14.3992746047230 + (-19.1042042304290 + o[2]*(5.3299167111971 - 21.2529753759340*sigma2c))*sigma2c + pi*(-0.311473344137600 + (0.60334840894623 - 0.042764839702509*sigma2c)*sigma2c + pi*(0.0058185597255259 + (-0.0145970082847530 + 0.0056631175631027*o[3])*sigma2c + pi*(-0.000076155864584577 + sigma2c*(0.000224403429193320 - 0.0000125610950134130*o[2]*sigma2c) + pi*(6.3323132660934e-7 + (-2.05419896753750e-6 + 3.6405370390082e-8*sigma2c)*sigma2c + pi*(-2.97598977892150e-9 + 1.01366185297630e-8*sigma2c + pi*(5.9925719692351e-12 + sigma2c*(-2.06778701051640e-11 + o[2]*(-2.08742781818860e-11 + (1.01621668250890e-10 - 1.64298282813470e-10*sigma2c)*sigma2c))))))))))))/o[1];
            end tps2c;

            function tps2 "Reverse function for region 2: T(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.Temperature T "Temperature (K)";
            protected
              Real pi "Dimensionless pressure";
              constant SI.SpecificEntropy SLIMIT = 5.85e3 "Subregion boundary specific entropy between regions 2a and 2b";
            algorithm
              if p < 4.0e6 then
                T := tps2a(p, s);
              elseif s > SLIMIT then
                T := tps2b(p, s);
              else
                T := tps2c(p, s);
              end if;
            end tps2;

            function tsat "Region 4 saturation temperature as a function of pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.Temperature t_sat "Temperature";
            protected
              Real pi "Dimensionless pressure";
              Real o[20] "Vector of auxiliary variables";
            algorithm
              assert(p > triple.ptriple, "IF97 medium function tsat called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              pi := min(p, data.PCRIT)*data.IPSTAR;
              o[1] := pi^0.25;
              o[2] := -3.2325550322333e6*o[1];
              o[3] := pi^0.5;
              o[4] := -724213.16703206*o[3];
              o[5] := 405113.40542057 + o[2] + o[4];
              o[6] := -17.0738469400920*o[1];
              o[7] := 14.9151086135300 + o[3] + o[6];
              o[8] := -4.0*o[5]*o[7];
              o[9] := 12020.8247024700*o[1];
              o[10] := 1167.05214527670*o[3];
              o[11] := -4823.2657361591 + o[10] + o[9];
              o[12] := o[11]*o[11];
              o[13] := o[12] + o[8];
              o[14] := o[13]^0.5;
              o[15] := -o[14];
              o[16] := -12020.8247024700*o[1];
              o[17] := -1167.05214527670*o[3];
              o[18] := 4823.2657361591 + o[15] + o[16] + o[17];
              o[19] := 1/o[18];
              o[20] := 2.0*o[19]*o[5];
              t_sat := 0.5*(650.17534844798 + o[20] - (-4.0*(-0.238555575678490 + 1300.35069689596*o[19]*o[5]) + (650.17534844798 + o[20])^2.0)^0.5);
              annotation(derivative = tsat_der);
            end tsat;

            function dtsatofp "Derivative of saturation temperature w.r.t. pressure"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output Real dtsat(unit = "K/Pa") "Derivative of T w.r.t. p";
            protected
              Real pi "Dimensionless pressure";
              Real o[49] "Vector of auxiliary variables";
            algorithm
              pi := max(Modelica.Constants.small, p*data.IPSTAR);
              o[1] := pi^0.75;
              o[2] := 1/o[1];
              o[3] := -4.268461735023*o[2];
              o[4] := sqrt(pi);
              o[5] := 1/o[4];
              o[6] := 0.5*o[5];
              o[7] := o[3] + o[6];
              o[8] := pi^0.25;
              o[9] := -3.2325550322333e6*o[8];
              o[10] := -724213.16703206*o[4];
              o[11] := 405113.40542057 + o[10] + o[9];
              o[12] := -4*o[11]*o[7];
              o[13] := -808138.758058325*o[2];
              o[14] := -362106.58351603*o[5];
              o[15] := o[13] + o[14];
              o[16] := -17.073846940092*o[8];
              o[17] := 14.91510861353 + o[16] + o[4];
              o[18] := -4*o[15]*o[17];
              o[19] := 3005.2061756175*o[2];
              o[20] := 583.52607263835*o[5];
              o[21] := o[19] + o[20];
              o[22] := 12020.82470247*o[8];
              o[23] := 1167.0521452767*o[4];
              o[24] := -4823.2657361591 + o[22] + o[23];
              o[25] := 2.0*o[21]*o[24];
              o[26] := o[12] + o[18] + o[25];
              o[27] := -4.0*o[11]*o[17];
              o[28] := o[24]*o[24];
              o[29] := o[27] + o[28];
              o[30] := sqrt(o[29]);
              o[31] := 1/o[30];
              o[32] := (-o[30]);
              o[33] := -12020.82470247*o[8];
              o[34] := -1167.0521452767*o[4];
              o[35] := 4823.2657361591 + o[32] + o[33] + o[34];
              o[36] := o[30];
              o[37] := -4823.2657361591 + o[22] + o[23] + o[36];
              o[38] := o[37]*o[37];
              o[39] := 1/o[38];
              o[40] := -1.72207339365771*o[30];
              o[41] := 21592.2055343628*o[8];
              o[42] := o[30]*o[8];
              o[43] := -8192.87114842946*o[4];
              o[44] := -0.510632954559659*o[30]*o[4];
              o[45] := -3100.02526152368*o[1];
              o[46] := pi;
              o[47] := 1295.95640782102*o[46];
              o[48] := 2862.09212505088 + o[40] + o[41] + o[42] + o[43] + o[44] + o[45] + o[47];
              o[49] := 1/(o[35]*o[35]);
              dtsat := data.IPSTAR*0.5*((2.0*o[15])/o[35] - 2.*o[11]*(-3005.2061756175*o[2] - 0.5*o[26]*o[31] - 583.52607263835*o[5])*o[49] - (20953.46356643991*(o[39]*(1295.95640782102 + 5398.05138359071*o[2] + 0.25*o[2]*o[30] - 0.861036696828853*o[26]*o[31] - 0.255316477279829*o[26]*o[31]*o[4] - 4096.43557421473*o[5] - 0.255316477279829*o[30]*o[5] - 2325.01894614276/o[8] + 0.5*o[26]*o[31]*o[8]) - 2.0*(o[19] + o[20] + 0.5*o[26]*o[31])*o[48]*o[37]^(-3)))/sqrt(o[39]*o[48]));
            end dtsatofp;

            function tsat_der "Derivative function for tsat"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.PressureSlope der_p "Pressure derivative";
              output SI.TemperatureSlope der_tsat "Temperature derivative";
            protected
              Real dtp;
            algorithm
              dtp := dtsatofp(p);
              der_tsat := dtp*der_p;
            end tsat_der;

            function psat "Region 4 saturation pressure as a function of temperature"
              extends Modelica.Icons.Function;
              input SI.Temperature T "Temperature (K)";
              output SI.Pressure p_sat "Pressure";
            protected
              Real o[8] "Vector of auxiliary variables";
              Real Tlim = min(T, data.TCRIT);
            algorithm
              assert(T >= 273.16, "IF97 medium function psat: input temperature (= " + String(triple.Ttriple) + " K).\n" + "lower than the triple point temperature 273.16 K");
              o[1] := -650.17534844798 + Tlim;
              o[2] := 1/o[1];
              o[3] := -0.238555575678490*o[2];
              o[4] := o[3] + Tlim;
              o[5] := -4823.2657361591*o[4];
              o[6] := o[4]*o[4];
              o[7] := 14.9151086135300*o[6];
              o[8] := 405113.40542057 + o[5] + o[7];
              p_sat := 16.0e6*o[8]*o[8]*o[8]*o[8]*1/(3.2325550322333e6 - 12020.8247024700*o[4] + 17.0738469400920*o[6] + sqrt(-4.0*(-724213.16703206 + 1167.05214527670*o[4] + o[6])*o[8] + (-3.2325550322333e6 + 12020.8247024700*o[4] - 17.0738469400920*o[6])^2.0))^4.0;
              annotation(derivative = psat_der);
            end psat;

            function dptofT "Derivative of pressure w.r.t. temperature along the saturation pressure curve"
              extends Modelica.Icons.Function;
              input SI.Temperature T "Temperature (K)";
              output Real dpt(unit = "Pa/K") "Temperature derivative of pressure";
            protected
              Real o[31] "Vector of auxiliary variables";
              Real Tlim "Temperature limited to TCRIT";
            algorithm
              Tlim := min(T, data.TCRIT);
              o[1] := -650.17534844798 + Tlim;
              o[2] := 1/o[1];
              o[3] := -0.238555575678490*o[2];
              o[4] := o[3] + Tlim;
              o[5] := -4823.2657361591*o[4];
              o[6] := o[4]*o[4];
              o[7] := 14.9151086135300*o[6];
              o[8] := 405113.40542057 + o[5] + o[7];
              o[9] := o[8]*o[8];
              o[10] := o[9]*o[9];
              o[11] := o[1]*o[1];
              o[12] := 1/o[11];
              o[13] := 0.238555575678490*o[12];
              o[14] := 1.00000000000000 + o[13];
              o[15] := 12020.8247024700*o[4];
              o[16] := -17.0738469400920*o[6];
              o[17] := -3.2325550322333e6 + o[15] + o[16];
              o[18] := -4823.2657361591*o[14];
              o[19] := 29.8302172270600*o[14]*o[4];
              o[20] := o[18] + o[19];
              o[21] := 1167.05214527670*o[4];
              o[22] := -724213.16703206 + o[21] + o[6];
              o[23] := o[17]*o[17];
              o[24] := -4.0000000000000*o[22]*o[8];
              o[25] := o[23] + o[24];
              o[26] := sqrt(o[25]);
              o[27] := -12020.8247024700*o[4];
              o[28] := 17.0738469400920*o[6];
              o[29] := 3.2325550322333e6 + o[26] + o[27] + o[28];
              o[30] := o[29]*o[29];
              o[31] := o[30]*o[30];
              dpt := 1e6*((-64.0*o[10]*(-12020.8247024700*o[14] + 34.147693880184*o[14]*o[4] + (0.5*(-4.0*o[20]*o[22] + 2.00000000000000*o[17]*(12020.8247024700*o[14] - 34.147693880184*o[14]*o[4]) - 4.0*(1167.05214527670*o[14] + 2.0*o[14]*o[4])*o[8]))/o[26]))/(o[29]*o[31]) + (64.*o[20]*o[8]*o[9])/o[31]);
            end dptofT;

            function psat_der "Derivative function for psat"
              extends Modelica.Icons.Function;
              input SI.Temperature T "Temperature (K)";
              input SI.TemperatureSlope der_T "Temperature derivative";
              output SI.PressureSlope der_psat "Pressure derivative";
            protected
              Real dpt;
            algorithm
              dpt := dptofT(T);
              der_psat := dpt*der_T;
            end psat_der;

            function h3ab_p "Region 3 a b boundary for pressure/enthalpy"
              extends Modelica.Icons.Function;
              output SI.SpecificEnthalpy h "Enthalpy";
              input SI.Pressure p "Pressure";
            protected
              constant Real n[:] = {0.201464004206875e4, 0.374696550136983e1, -0.219921901054187e-1, 0.875131686009950e-4};
              constant SI.SpecificEnthalpy hstar = 1000 "Normalization enthalpy";
              constant SI.Pressure pstar = 1e6 "Normalization pressure";
              Real pi = p/pstar "Normalized specific pressure";
            algorithm
              h := (n[1] + n[2]*pi + n[3]*pi^2 + n[4]*pi^3)*hstar;
            end h3ab_p;

            function T3a_ph "Region 3 a: inverse function T(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.Temperature T "Temperature";
            protected
              constant Real n[:] = {-0.133645667811215e-6, 0.455912656802978e-5, -0.146294640700979e-4, 0.639341312970080e-2, 0.372783927268847e3, -0.718654377460447e4, 0.573494752103400e6, -0.267569329111439e7, -0.334066283302614e-4, -0.245479214069597e-1, 0.478087847764996e2, 0.764664131818904e-5, 0.128350627676972e-2, 0.171219081377331e-1, -0.851007304583213e1, -0.136513461629781e-1, -0.384460997596657e-5, 0.337423807911655e-2, -0.551624873066791, 0.729202277107470, -0.992522757376041e-2, -0.119308831407288, 0.793929190615421, 0.454270731799386, 0.209998591259910, -0.642109823904738e-2, -0.235155868604540e-1, 0.252233108341612e-2, -0.764885133368119e-2, 0.136176427574291e-1, -0.133027883575669e-1};
              constant Real I[:] = {-12, -12, -12, -12, -12, -12, -12, -12, -10, -10, -10, -8, -8, -8, -8, -5, -3, -2, -2, -2, -1, -1, 0, 0, 1, 3, 3, 4, 4, 10, 12};
              constant Real J[:] = {0, 1, 2, 6, 14, 16, 20, 22, 1, 5, 12, 0, 2, 4, 10, 2, 0, 1, 3, 4, 0, 2, 0, 1, 1, 0, 1, 0, 3, 4, 5};
              constant SI.SpecificEnthalpy hstar = 2300e3 "Normalization enthalpy";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.Temperature Tstar = 760 "Normalization temperature";
              Real pi = p/pstar "Normalized specific pressure";
              Real eta = h/hstar "Normalized specific enthalpy";
            algorithm
              T := sum(n[i]*(pi + 0.240)^I[i]*(eta - 0.615)^J[i] for i in 1:31)*Tstar;
            end T3a_ph;

            function T3b_ph "Region 3 b: inverse function T(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.Temperature T "Temperature";
            protected
              constant Real n[:] = {0.323254573644920e-4, -0.127575556587181e-3, -0.475851877356068e-3, 0.156183014181602e-2, 0.105724860113781, -0.858514221132534e2, 0.724140095480911e3, 0.296475810273257e-2, -0.592721983365988e-2, -0.126305422818666e-1, -0.115716196364853, 0.849000969739595e2, -0.108602260086615e-1, 0.154304475328851e-1, 0.750455441524466e-1, 0.252520973612982e-1, -0.602507901232996e-1, -0.307622221350501e1, -0.574011959864879e-1, 0.503471360939849e1, -0.925081888584834, 0.391733882917546e1, -0.773146007130190e2, 0.949308762098587e4, -0.141043719679409e7, 0.849166230819026e7, 0.861095729446704, 0.323346442811720, 0.873281936020439, -0.436653048526683, 0.286596714529479, -0.131778331276228, 0.676682064330275e-2};
              constant Real I[:] = {-12, -12, -10, -10, -10, -10, -10, -8, -8, -8, -8, -8, -6, -6, -6, -4, -4, -3, -2, -2, -1, -1, -1, -1, -1, -1, 0, 0, 1, 3, 5, 6, 8};
              constant Real J[:] = {0, 1, 0, 1, 5, 10, 12, 0, 1, 2, 4, 10, 0, 1, 2, 0, 1, 5, 0, 4, 2, 4, 6, 10, 14, 16, 0, 2, 1, 1, 1, 1, 1};
              constant SI.Temperature Tstar = 860 "Normalization temperature";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.SpecificEnthalpy hstar = 2800e3 "Normalization enthalpy";
              Real pi = p/pstar "Normalized specific pressure";
              Real eta = h/hstar "Normalized specific enthalpy";
            algorithm
              T := sum(n[i]*(pi + 0.298)^I[i]*(eta - 0.720)^J[i] for i in 1:33)*Tstar;
            end T3b_ph;

            function v3a_ph "Region 3 a: inverse function v(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.SpecificVolume v "Specific volume";
            protected
              constant Real n[:] = {0.529944062966028e-2, -0.170099690234461, 0.111323814312927e2, -0.217898123145125e4, -0.506061827980875e-3, 0.556495239685324, -0.943672726094016e1, -0.297856807561527, 0.939353943717186e2, 0.192944939465981e-1, 0.421740664704763, -0.368914126282330e7, -0.737566847600639e-2, -0.354753242424366, -0.199768169338727e1, 0.115456297059049e1, 0.568366875815960e4, 0.808169540124668e-2, 0.172416341519307, 0.104270175292927e1, -0.297691372792847, 0.560394465163593, 0.275234661176914, -0.148347894866012, -0.651142513478515e-1, -0.292468715386302e1, 0.664876096952665e-1, 0.352335014263844e1, -0.146340792313332e-1, -0.224503486668184e1, 0.110533464706142e1, -0.408757344495612e-1};
              constant Real I[:] = {-12, -12, -12, -12, -10, -10, -10, -8, -8, -6, -6, -6, -4, -4, -3, -2, -2, -1, -1, -1, -1, 0, 0, 1, 1, 1, 2, 2, 3, 4, 5, 8};
              constant Real J[:] = {6, 8, 12, 18, 4, 7, 10, 5, 12, 3, 4, 22, 2, 3, 7, 3, 16, 0, 1, 2, 3, 0, 1, 0, 1, 2, 0, 2, 0, 2, 2, 2};
              constant SI.Volume vstar = 0.0028 "Normalization temperature";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.SpecificEnthalpy hstar = 2100e3 "Normalization enthalpy";
              Real pi = p/pstar "Normalized specific pressure";
              Real eta = h/hstar "Normalized specific enthalpy";
            algorithm
              v := sum(n[i]*(pi + 0.128)^I[i]*(eta - 0.727)^J[i] for i in 1:32)*vstar;
            end v3a_ph;

            function v3b_ph "Region 3 b: inverse function v(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.SpecificVolume v "Specific volume";
            protected
              constant Real n[:] = {-0.225196934336318e-8, 0.140674363313486e-7, 0.233784085280560e-5, -0.331833715229001e-4, 0.107956778514318e-2, -0.271382067378863, 0.107202262490333e1, -0.853821329075382, -0.215214194340526e-4, 0.769656088222730e-3, -0.431136580433864e-2, 0.453342167309331, -0.507749535873652, -0.100475154528389e3, -0.219201924648793, -0.321087965668917e1, 0.607567815637771e3, 0.557686450685932e-3, 0.187499040029550, 0.905368030448107e-2, 0.285417173048685, 0.329924030996098e-1, 0.239897419685483, 0.482754995951394e1, -0.118035753702231e2, 0.169490044091791, -0.179967222507787e-1, 0.371810116332674e-1, -0.536288335065096e-1, 0.160697101092520e1};
              constant Real I[:] = {-12, -12, -8, -8, -8, -8, -8, -8, -6, -6, -6, -6, -6, -6, -4, -4, -4, -3, -3, -2, -2, -1, -1, -1, -1, 0, 1, 1, 2, 2};
              constant Real J[:] = {0, 1, 0, 1, 3, 6, 7, 8, 0, 1, 2, 5, 6, 10, 3, 6, 10, 0, 2, 1, 2, 0, 1, 4, 5, 0, 0, 1, 2, 6};
              constant SI.Volume vstar = 0.0088 "Normalization temperature";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.SpecificEnthalpy hstar = 2800e3 "Normalization enthalpy";
              Real pi = p/pstar "Normalized specific pressure";
              Real eta = h/hstar "Normalized specific enthalpy";
            algorithm
              v := sum(n[i]*(pi + 0.0661)^I[i]*(eta - 0.720)^J[i] for i in 1:30)*vstar;
            end v3b_ph;

            function T3a_ps "Region 3 a: inverse function T(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.Temperature T "Temperature";
            protected
              constant Real n[:] = {0.150042008263875e10, -0.159397258480424e12, 0.502181140217975e-3, -0.672057767855466e2, 0.145058545404456e4, -0.823889534888890e4, -0.154852214233853, 0.112305046746695e2, -0.297000213482822e2, 0.438565132635495e11, 0.137837838635464e-2, -0.297478527157462e1, 0.971777947349413e13, -0.571527767052398e-4, 0.288307949778420e5, -0.744428289262703e14, 0.128017324848921e2, -0.368275545889071e3, 0.664768904779177e16, 0.449359251958880e-1, -0.422897836099655e1, -0.240614376434179, -0.474341365254924e1, 0.724093999126110, 0.923874349695897, 0.399043655281015e1, 0.384066651868009e-1, -0.359344365571848e-2, -0.735196448821653, 0.188367048396131, 0.141064266818704e-3, -0.257418501496337e-2, 0.123220024851555e-2};
              constant Real I[:] = {-12, -12, -10, -10, -10, -10, -8, -8, -8, -8, -6, -6, -6, -5, -5, -5, -4, -4, -4, -2, -2, -1, -1, 0, 0, 0, 1, 2, 2, 3, 8, 8, 10};
              constant Real J[:] = {28, 32, 4, 10, 12, 14, 5, 7, 8, 28, 2, 6, 32, 0, 14, 32, 6, 10, 36, 1, 4, 1, 6, 0, 1, 4, 0, 0, 3, 2, 0, 1, 2};
              constant SI.Temperature Tstar = 760 "Normalization temperature";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.SpecificEntropy sstar = 4.4e3 "Normalization entropy";
              Real pi = p/pstar "Normalized specific pressure";
              Real sigma = s/sstar "Normalized specific entropy";
            algorithm
              T := sum(n[i]*(pi + 0.240)^I[i]*(sigma - 0.703)^J[i] for i in 1:33)*Tstar;
            end T3a_ps;

            function T3b_ps "Region 3 b: inverse function T(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.Temperature T "Temperature";
            protected
              constant Real n[:] = {0.527111701601660, -0.401317830052742e2, 0.153020073134484e3, -0.224799398218827e4, -0.193993484669048, -0.140467557893768e1, 0.426799878114024e2, 0.752810643416743, 0.226657238616417e2, -0.622873556909932e3, -0.660823667935396, 0.841267087271658, -0.253717501764397e2, 0.485708963532948e3, 0.880531517490555e3, 0.265015592794626e7, -0.359287150025783, -0.656991567673753e3, 0.241768149185367e1, 0.856873461222588, 0.655143675313458, -0.213535213206406, 0.562974957606348e-2, -0.316955725450471e15, -0.699997000152457e-3, 0.119845803210767e-1, 0.193848122022095e-4, -0.215095749182309e-4};
              constant Real I[:] = {-12, -12, -12, -12, -8, -8, -8, -6, -6, -6, -5, -5, -5, -5, -5, -4, -3, -3, -2, 0, 2, 3, 4, 5, 6, 8, 12, 14};
              constant Real J[:] = {1, 3, 4, 7, 0, 1, 3, 0, 2, 4, 0, 1, 2, 4, 6, 12, 1, 6, 2, 0, 1, 1, 0, 24, 0, 3, 1, 2};
              constant SI.Temperature Tstar = 860 "Normalization temperature";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.SpecificEntropy sstar = 5.3e3 "Normalization entropy";
              Real pi = p/pstar "Normalized specific pressure";
              Real sigma = s/sstar "Normalized specific entropy";
            algorithm
              T := sum(n[i]*(pi + 0.760)^I[i]*(sigma - 0.818)^J[i] for i in 1:28)*Tstar;
            end T3b_ps;

            function v3a_ps "Region 3 a: inverse function v(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.SpecificVolume v "Specific volume";
            protected
              constant Real n[:] = {0.795544074093975e2, -0.238261242984590e4, 0.176813100617787e5, -0.110524727080379e-2, -0.153213833655326e2, 0.297544599376982e3, -0.350315206871242e8, 0.277513761062119, -0.523964271036888, -0.148011182995403e6, 0.160014899374266e7, 0.170802322663427e13, 0.246866996006494e-3, 0.165326084797980e1, -0.118008384666987, 0.253798642355900e1, 0.965127704669424, -0.282172420532826e2, 0.203224612353823, 0.110648186063513e1, 0.526127948451280, 0.277000018736321, 0.108153340501132e1, -0.744127885357893e-1, 0.164094443541384e-1, -0.680468275301065e-1, 0.257988576101640e-1, -0.145749861944416e-3};
              constant Real I[:] = {-12, -12, -12, -10, -10, -10, -10, -8, -8, -8, -8, -6, -5, -4, -3, -3, -2, -2, -1, -1, 0, 0, 0, 1, 2, 4, 5, 6};
              constant Real J[:] = {10, 12, 14, 4, 8, 10, 20, 5, 6, 14, 16, 28, 1, 5, 2, 4, 3, 8, 1, 2, 0, 1, 3, 0, 0, 2, 2, 0};
              constant SI.Volume vstar = 0.0028 "Normalization temperature";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.SpecificEntropy sstar = 4.4e3 "Normalization entropy";
              Real pi = p/pstar "Normalized specific pressure";
              Real sigma = s/sstar "Normalized specific entropy";
            algorithm
              v := sum(n[i]*(pi + 0.187)^I[i]*(sigma - 0.755)^J[i] for i in 1:28)*vstar;
            end v3a_ps;

            function v3b_ps "Region 3 b: inverse function v(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              output SI.SpecificVolume v "Specific volume";
            protected
              constant Real n[:] = {0.591599780322238e-4, -0.185465997137856e-2, 0.104190510480013e-1, 0.598647302038590e-2, -0.771391189901699, 0.172549765557036e1, -0.467076079846526e-3, 0.134533823384439e-1, -0.808094336805495e-1, 0.508139374365767, 0.128584643361683e-2, -0.163899353915435e1, 0.586938199318063e1, -0.292466667918613e1, -0.614076301499537e-2, 0.576199014049172e1, -0.121613320606788e2, 0.167637540957944e1, -0.744135838773463e1, 0.378168091437659e-1, 0.401432203027688e1, 0.160279837479185e2, 0.317848779347728e1, -0.358362310304853e1, -0.115995260446827e7, 0.199256573577909, -0.122270624794624, -0.191449143716586e2, -0.150448002905284e-1, 0.146407900162154e2, -0.327477787188230e1};
              constant Real I[:] = {-12, -12, -12, -12, -12, -12, -10, -10, -10, -10, -8, -5, -5, -5, -4, -4, -4, -4, -3, -2, -2, -2, -2, -2, -2, 0, 0, 0, 1, 1, 2};
              constant Real J[:] = {0, 1, 2, 3, 5, 6, 0, 1, 2, 4, 0, 1, 2, 3, 0, 1, 2, 3, 1, 0, 1, 2, 3, 4, 12, 0, 1, 2, 0, 2, 2};
              constant SI.Volume vstar = 0.0088 "Normalization temperature";
              constant SI.Pressure pstar = 100e6 "Normalization pressure";
              constant SI.SpecificEntropy sstar = 5.3e3 "Normalization entropy";
              Real pi = p/pstar "Normalized specific pressure";
              Real sigma = s/sstar "Normalized specific entropy";
            algorithm
              v := sum(n[i]*(pi + 0.298)^I[i]*(sigma - 0.816)^J[i] for i in 1:31)*vstar;
            end v3b_ps;
          end Basic;

          package Transport "Transport properties for water according to IAPWS/IF97"
            extends Modelica.Icons.FunctionsPackage;

            function visc_dTp "Dynamic viscosity eta(d,T,p), industrial formulation"
              extends Modelica.Icons.Function;
              input SI.Density d "Density";
              input SI.Temperature T "Temperature (K)";
              input SI.Pressure p "Pressure (only needed for region of validity)";
              input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known (unused)";
              input Boolean checkLimits = true "Check if inputs d,T,P are in region of validity";
              output SI.DynamicViscosity eta "Dynamic viscosity";
            protected
              constant Real n0 = 1.0 "Viscosity coefficient";
              constant Real n1 = 0.978197 "Viscosity coefficient";
              constant Real n2 = 0.579829 "Viscosity coefficient";
              constant Real n3 = -0.202354 "Viscosity coefficient";
              constant Real nn[42] = array(0.5132047, 0.3205656, 0.0, 0.0, -0.7782567, 0.1885447, 0.2151778, 0.7317883, 1.241044, 1.476783, 0.0, 0.0, -0.2818107, -1.070786, -1.263184, 0.0, 0.0, 0.0, 0.1778064, 0.460504, 0.2340379, -0.4924179, 0.0, 0.0, -0.0417661, 0.0, 0.0, 0.1600435, 0.0, 0.0, 0.0, -0.01578386, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.003629481, 0.0, 0.0) "Viscosity coefficients";
              constant SI.Density rhostar = 317.763 "Scaling density";
              constant SI.DynamicViscosity etastar = 55.071e-6 "Scaling viscosity";
              constant SI.Temperature tstar = 647.226 "Scaling temperature";
              Integer i "Auxiliary variable";
              Integer j "Auxiliary variable";
              Real delta "Dimensionless density";
              Real deltam1 "Dimensionless density";
              Real tau "Dimensionless temperature";
              Real taum1 "Dimensionless temperature";
              Real Psi0 "Auxiliary variable";
              Real Psi1 "Auxiliary variable";
              Real tfun "Auxiliary variable";
              Real rhofun "Auxiliary variable";
              Real Tc = T - 273.15 "Celsius temperature for region check";
            algorithm
              delta := d/rhostar;
              if checkLimits then
                assert(d > triple.dvtriple, "IF97 medium function visc_dTp for viscosity called with too low density\n" + "d = " + String(d) + " <= " + String(triple.dvtriple) + " (triple point density)");
                assert((p <= 500e6 and (Tc >= 0.0 and Tc <= 150)) or (p <= 350e6 and (Tc > 150.0 and Tc <= 600)) or (p <= 300e6 and (Tc > 600.0 and Tc <= 900)), "IF97 medium function visc_dTp: viscosity computed outside the range\n" + "of validity of the IF97 formulation: p = " + String(p) + " Pa, Tc = " + String(Tc) + " K");
              else
              end if;
              deltam1 := delta - 1.0;
              tau := tstar/T;
              taum1 := tau - 1.0;
              Psi0 := 1/(n0 + (n1 + (n2 + n3*tau)*tau)*tau)/(sqrt(tau));
              Psi1 := 0.0;
              tfun := 1.0;
              for i in 1:6 loop
                if (i <> 1) then
                  tfun := tfun*taum1;
                else
                end if;
                rhofun := 1.;
                for j in 0:6 loop
                  if (j <> 0) then
                    rhofun := rhofun*deltam1;
                  else
                  end if;
                  Psi1 := Psi1 + nn[i + j*6]*tfun*rhofun;
                end for;
              end for;
              eta := etastar*Psi0*Modelica.Math.exp(delta*Psi1);
            end visc_dTp;

            function cond_dTp "Thermal conductivity lam(d,T,p) (industrial use version) only in one-phase region"
              extends Modelica.Icons.Function;
              input SI.Density d "Density";
              input SI.Temperature T "Temperature (K)";
              input SI.Pressure p "Pressure";
              input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
              input Boolean industrialMethod = true "If true, the industrial method is used, otherwise the scientific one";
              input Boolean checkLimits = true "Check if inputs d,T,P are in region of validity";
              output SI.ThermalConductivity lambda "Thermal conductivity";
            protected
              Integer region(min = 1, max = 5) "IF97 region, valid values:1,2,3, and 5";
              constant Real n0 = 1.0 "Conductivity coefficient";
              constant Real n1 = 6.978267 "Conductivity coefficient";
              constant Real n2 = 2.599096 "Conductivity coefficient";
              constant Real n3 = -0.998254 "Conductivity coefficient";
              constant Real nn[30] = array(1.3293046, 1.7018363, 5.2246158, 8.7127675, -1.8525999, -0.40452437, -2.2156845, -10.124111, -9.5000611, 0.9340469, 0.2440949, 1.6511057, 4.9874687, 4.3786606, 0.0, 0.018660751, -0.76736002, -0.27297694, -0.91783782, 0.0, -0.12961068, 0.37283344, -0.43083393, 0.0, 0.0, 0.044809953, -0.1120316, 0.13333849, 0.0, 0.0) "Conductivity coefficient";
              constant SI.ThermalConductivity lamstar = 0.4945 "Scaling conductivity";
              constant SI.Density rhostar = 317.763 "Scaling density";
              constant SI.Temperature tstar = 647.226 "Scaling temperature";
              constant SI.Pressure pstar = 22.115e6 "Scaling pressure";
              constant SI.DynamicViscosity etastar = 55.071e-6 "Scaling viscosity";
              Integer i "Auxiliary variable";
              Integer j "Auxiliary variable";
              Real delta "Dimensionless density";
              Real tau "Dimensionless temperature";
              Real deltam1 "Dimensionless density";
              Real taum1 "Dimensionless temperature";
              Real Lam0 "Part of thermal conductivity";
              Real Lam1 "Part of thermal conductivity";
              Real Lam2 "Part of thermal conductivity";
              Real tfun "Auxiliary variable";
              Real rhofun "Auxiliary variable";
              Real dpitau "Auxiliary variable";
              Real ddelpi "Auxiliary variable";
              Real d2 "Auxiliary variable";
              Modelica.Media.Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
              Modelica.Media.Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
              Real Tc = T - 273.15 "Celsius temperature for region check";
              Real Chi "Symmetrized compressibility";
              constant SI.Density rhostar2 = 317.7 "Reference density";
              constant SI.Temperature Tstar2 = 647.25 "Reference temperature";
              constant SI.ThermalConductivity lambdastar = 1 "Reference thermal conductivity";
              Real TREL = T/Tstar2 "Relative temperature";
              Real rhoREL = d/rhostar2 "Relative density";
              Real lambdaREL "Relative thermal conductivity";
              Real deltaTREL "Relative temperature increment";
              constant Real C[:] = {0.642857, -4.11717, -6.17937, 0.00308976, 0.0822994, 10.0932};
              constant Real dpar[:] = {0.0701309, 0.0118520, 0.00169937, -1.0200};
              constant Real b[:] = {-0.397070, 0.400302, 1.060000};
              constant Real B[:] = {-0.171587, 2.392190};
              constant Real a[:] = {0.0102811, 0.0299621, 0.0156146, -0.00422464};
              Real Q;
              Real S;
              Real lambdaREL2 "Function, part of the interpolating equation of the thermal conductivity";
              Real lambdaREL1 "Function, part of the interpolating equation of the thermal conductivity";
              Real lambdaREL0 "Function, part of the interpolating equation of the thermal conductivity";
            algorithm
              if checkLimits then
                assert(d > triple.dvtriple, "IF97 medium function cond_dTp called with too low density\n" + "d = " + String(d) + " <= " + String(triple.dvtriple) + " (triple point density)");
                assert((p <= 100e6 and (Tc >= 0.0 and Tc <= 500)) or (p <= 70e6 and (Tc > 500.0 and Tc <= 650)) or (p <= 40e6 and (Tc > 650.0 and Tc <= 800)), "IF97 medium function cond_dTp: thermal conductivity computed outside the range\n" + "of validity of the IF97 formulation: p = " + String(p) + " Pa, Tc = " + String(Tc) + " K");
              else
              end if;
              if industrialMethod then
                deltaTREL := abs(TREL - 1) + C[4];
                Q := 2 + C[5]/deltaTREL^(3/5);
                if TREL >= 1 then
                  S := 1/deltaTREL;
                else
                  S := C[6]/deltaTREL^(3/5);
                end if;
                lambdaREL2 := (dpar[1]/TREL^10 + dpar[2])*rhoREL^(9/5)*Modelica.Math.exp(C[1]*(1 - rhoREL^(14/5))) + dpar[3]*S*rhoREL^Q*Modelica.Math.exp((Q/(1 + Q))*(1 - rhoREL^(1 + Q))) + dpar[4]*Modelica.Math.exp(C[2]*TREL^(3/2) + C[3]/rhoREL^5);
                lambdaREL1 := b[1] + b[2]*rhoREL + b[3]*Modelica.Math.exp(B[1]*(rhoREL + B[2])^2);
                lambdaREL0 := TREL^(1/2)*sum(a[i]*TREL^(i - 1) for i in 1:4);
                lambdaREL := lambdaREL0 + lambdaREL1 + lambdaREL2;
                lambda := lambdaREL*lambdastar;
              else
                if p < data.PLIMIT4A then
                  if d > data.DCRIT then
                    region := 1;
                  else
                    region := 2;
                  end if;
                else
                  assert(false, "The scientific method works only for temperature up to 623.15 K");
                end if;
                tau := tstar/T;
                delta := d/rhostar;
                deltam1 := delta - 1.0;
                taum1 := tau - 1.0;
                Lam0 := 1/(n0 + (n1 + (n2 + n3*tau)*tau)*tau)/(tau^0.5);
                Lam1 := 0.0;
                tfun := 1.0;
                for i in 1:5 loop
                  if (i <> 1) then
                    tfun := tfun*taum1;
                  else
                  end if;
                  rhofun := 1.0;
                  for j in 0:5 loop
                    if (j <> 0) then
                      rhofun := rhofun*deltam1;
                    else
                    end if;
                    Lam1 := Lam1 + nn[i + j*5]*tfun*rhofun;
                  end for;
                end for;
                if (region == 1) then
                  g := Basic.g1(p, T);
                  dpitau := -tstar/pstar*(data.PSTAR1*(g.gpi - data.TSTAR1/T*g.gtaupi)/g.gpipi/T);
                  ddelpi := -pstar/rhostar*data.RH2O/data.PSTAR1/data.PSTAR1*T*d*d*g.gpipi;
                  Chi := delta*ddelpi;
                elseif (region == 2) then
                  g := Basic.g2(p, T);
                  dpitau := -tstar/pstar*(data.PSTAR2*(g.gpi - data.TSTAR2/T*g.gtaupi)/g.gpipi/T);
                  ddelpi := -pstar/rhostar*data.RH2O/data.PSTAR2/data.PSTAR2*T*d*d*g.gpipi;
                  Chi := delta*ddelpi;
                else
                  assert(false, "Thermal conductivity can only be called in the one-phase regions below 623.15 K\n" + "(p = " + String(p) + " Pa, T = " + String(T) + " K, region = " + String(region) + ")");
                end if;
                taum1 := 1/tau - 1;
                d2 := deltam1*deltam1;
                Lam2 := 0.0013848*etastar/visc_dTp(d, T, p)/(tau*tau*delta*delta)*dpitau*dpitau*max(Chi, Modelica.Constants.small)^0.4678*(delta)^0.5*Modelica.Math.exp(-18.66*taum1*taum1 - d2*d2);
                lambda := lamstar*(Lam0*Modelica.Math.exp(delta*Lam1) + Lam2);
              end if;
            end cond_dTp;

            function surfaceTension "Surface tension in region 4 between steam and water"
              extends Modelica.Icons.Function;
              input SI.Temperature T "Temperature (K)";
              output SI.SurfaceTension sigma "Surface tension in SI units";
            protected
              Real Theta "Dimensionless temperature";
            algorithm
              Theta := min(1.0, T/data.TCRIT);
              sigma := 235.8e-3*(1 - Theta)^1.256*(1 - 0.625*(1 - Theta));
            end surfaceTension;
          end Transport;

          package Isentropic "Functions for calculating the isentropic enthalpy from pressure p and specific entropy s"
            extends Modelica.Icons.FunctionsPackage;

            function hofpT1 "Intermediate function for isentropic specific enthalpy in region 1"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real o[13] "Vector of auxiliary variables";
              Real pi1 "Dimensionless pressure";
              Real tau "Dimensionless temperature";
              Real tau1 "Dimensionless temperature";
            algorithm
              tau := data.TSTAR1/T;
              pi1 := 7.1 - p/data.PSTAR1;
              assert(p > triple.ptriple, "IF97 medium function hofpT1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              tau1 := -1.222 + tau;
              o[1] := tau1*tau1;
              o[2] := o[1]*tau1;
              o[3] := o[1]*o[1];
              o[4] := o[3]*o[3];
              o[5] := o[1]*o[4];
              o[6] := o[1]*o[3];
              o[7] := o[3]*tau1;
              o[8] := o[3]*o[4];
              o[9] := pi1*pi1;
              o[10] := o[9]*o[9];
              o[11] := o[10]*o[10];
              o[12] := o[4]*o[4];
              o[13] := o[12]*o[12];
              h := data.RH2O*T*tau*(pi1*((-0.00254871721114236 + o[1]*(0.00424944110961118 + (0.018990068218419 + (-0.021841717175414 - 0.00015851507390979*o[1])*o[1])*o[6]))/o[5] + pi1*((0.00141552963219801 + o[3]*(0.000047661393906987 + o[1]*(-0.0000132425535992538 - 1.2358149370591e-14*o[1]*o[3]*o[4])))/o[3] + pi1*((0.000126718579380216 - 5.11230768720618e-9*o[5])/o[7] + pi1*((0.000011212640954 + o[2]*(1.30342445791202e-6 - 1.4341729937924e-12*o[8]))/o[6] + pi1*(o[9]*pi1*((1.40077319158051e-8 + 1.04549227383804e-9*o[7])/o[8] + o[10]*o[11]*pi1*(1.9941018075704e-17/(o[1]*o[12]*o[3]*o[4]) + o[9]*(-4.48827542684151e-19/o[13] + o[10]*o[9]*(pi1*(4.65957282962769e-22/(o[13]*o[4]) + pi1*((3.83502057899078e-24*pi1)/(o[1]*o[13]*o[4]) - 7.2912378325616e-23/(o[13]*o[4]*tau1))) - 1.00075970318621e-21/(o[1]*o[13]*o[3]*tau1))))) + 3.24135974880936e-6/(o[4]*tau1)))))) + (-0.29265942426334 + tau1*(0.84548187169114 + o[1]*(3.3855169168385 + tau1*(-1.91583926775744 + tau1*(0.47316115539684 + (-0.066465668798004 + 0.0040607314991784*tau1)*tau1)))))/o[2]);
            end hofpT1;

            function handsofpT1 "Special function for specific enthalpy and specific entropy in region 1"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real o[28] "Vector of auxiliary variables";
              Real pi1 "Dimensionless pressure";
              Real tau "Dimensionless temperature";
              Real tau1 "Dimensionless temperature";
              Real g "Dimensionless Gibbs energy";
              Real gtau "Derivative of dimensionless Gibbs energy w.r.t. tau";
            algorithm
              assert(p > triple.ptriple, "IF97 medium function handsofpT1 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              tau := data.TSTAR1/T;
              pi1 := 7.1 - p/data.PSTAR1;
              tau1 := -1.222 + tau;
              o[1] := tau1*tau1;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              o[4] := o[3]*tau1;
              o[5] := 1/o[4];
              o[6] := o[1]*o[2];
              o[7] := o[1]*tau1;
              o[8] := 1/o[7];
              o[9] := o[1]*o[2]*o[3];
              o[10] := 1/o[2];
              o[11] := o[2]*tau1;
              o[12] := 1/o[11];
              o[13] := o[2]*o[3];
              o[14] := pi1*pi1;
              o[15] := o[14]*pi1;
              o[16] := o[14]*o[14];
              o[17] := o[16]*o[16];
              o[18] := o[16]*o[17]*pi1;
              o[19] := o[14]*o[16];
              o[20] := o[3]*o[3];
              o[21] := o[20]*o[20];
              o[22] := o[21]*o[3]*tau1;
              o[23] := 1/o[22];
              o[24] := o[21]*o[3];
              o[25] := 1/o[24];
              o[26] := o[1]*o[2]*o[21]*tau1;
              o[27] := 1/o[26];
              o[28] := o[1]*o[3];
              g := pi1*(pi1*(pi1*(o[10]*(-0.000031679644845054 + o[2]*(-2.8270797985312e-6 - 8.5205128120103e-10*o[6])) + pi1*(o[12]*(-2.2425281908e-6 + (-6.5171222895601e-7 - 1.4341729937924e-13*o[13])*o[7]) + pi1*(-4.0516996860117e-7/o[3] + o[15]*(o[18]*(o[14]*(o[19]*(2.6335781662795e-23/(o[1]*o[2]*o[21]) + pi1*(-1.1947622640071e-23*o[27] + pi1*(1.8228094581404e-24*o[25] - 9.3537087292458e-26*o[23]*pi1))) + 1.4478307828521e-20/(o[1]*o[2]*o[20]*o[3]*tau1)) - 6.8762131295531e-19/(o[2]*o[20]*o[3]*tau1)) + (-1.2734301741641e-9 - 1.7424871230634e-10*o[11])/(o[1]*o[3]*tau1))))) + o[8]*(-0.00047184321073267 + o[7]*(-0.00030001780793026 + (0.000047661393906987 + o[1]*(-4.4141845330846e-6 - 7.2694996297594e-16*o[9]))*tau1))) + o[5]*(0.00028319080123804 + o[1]*(-0.00060706301565874 + o[6]*(-0.018990068218419 + tau1*(-0.032529748770505 + (-0.021841717175414 - 0.00005283835796993*o[1])*tau1))))) + (0.14632971213167 + tau1*(-0.84548187169114 + tau1*(-3.756360367204 + tau1*(3.3855169168385 + tau1*(-0.95791963387872 + tau1*(0.15772038513228 + (-0.016616417199501 + 0.00081214629983568*tau1)*tau1))))))/o[1];
              gtau := pi1*((-0.00254871721114236 + o[1]*(0.00424944110961118 + (0.018990068218419 + (-0.021841717175414 - 0.00015851507390979*o[1])*o[1])*o[6]))/o[28] + pi1*(o[10]*(0.00141552963219801 + o[2]*(0.000047661393906987 + o[1]*(-0.0000132425535992538 - 1.2358149370591e-14*o[9]))) + pi1*(o[12]*(0.000126718579380216 - 5.11230768720618e-9*o[28]) + pi1*((0.000011212640954 + (1.30342445791202e-6 - 1.4341729937924e-12*o[13])*o[7])/o[6] + pi1*(3.24135974880936e-6*o[5] + o[15]*((1.40077319158051e-8 + 1.04549227383804e-9*o[11])/o[13] + o[18]*(1.9941018075704e-17/(o[1]*o[2]*o[20]*o[3]) + o[14]*(-4.48827542684151e-19/o[21] + o[19]*(-1.00075970318621e-21*o[27] + pi1*(4.65957282962769e-22*o[25] + pi1*(-7.2912378325616e-23*o[23] + (3.83502057899078e-24*pi1)/(o[1]*o[21]*o[3])))))))))))) + o[8]*(-0.29265942426334 + tau1*(0.84548187169114 + o[1]*(3.3855169168385 + tau1*(-1.91583926775744 + tau1*(0.47316115539684 + (-0.066465668798004 + 0.0040607314991784*tau1)*tau1)))));
              h := data.RH2O*T*tau*gtau;
              s := data.RH2O*(tau*gtau - g);
            end handsofpT1;

            function hofpT2 "Intermediate function for isentropic specific enthalpy in region 2"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output SI.SpecificEnthalpy h "Specific enthalpy";
            protected
              Real o[16] "Vector of auxiliary variables";
              Real pi "Dimensionless pressure";
              Real tau "Dimensionless temperature";
              Real tau2 "Dimensionless temperature";
            algorithm
              assert(p > triple.ptriple, "IF97 medium function hofpT2 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              pi := p/data.PSTAR2;
              tau := data.TSTAR2/T;
              tau2 := -0.5 + tau;
              o[1] := tau*tau;
              o[2] := o[1]*o[1];
              o[3] := tau2*tau2;
              o[4] := o[3]*tau2;
              o[5] := o[3]*o[3];
              o[6] := o[5]*o[5];
              o[7] := o[6]*o[6];
              o[8] := o[5]*o[6]*o[7]*tau2;
              o[9] := o[3]*o[5];
              o[10] := o[5]*o[6]*tau2;
              o[11] := o[3]*o[7]*tau2;
              o[12] := o[3]*o[5]*o[6];
              o[13] := o[5]*o[6]*o[7];
              o[14] := pi*pi;
              o[15] := o[14]*o[14];
              o[16] := o[7]*o[7];
              h := data.RH2O*T*tau*((0.0280439559151 + tau*(-0.2858109552582 + tau*(1.2213149471784 + tau*(-2.848163942888 + tau*(4.38395111945 + o[1]*(10.08665568018 + (-0.5681726521544 + 0.06380539059921*tau)*tau))))))/(o[1]*o[2]) + pi*(-0.017834862292358 + tau2*(-0.09199202739273 + (-0.172743777250296 - 0.30195167236758*o[4])*tau2) + pi*(-0.000033032641670203 + (-0.0003789797503263 + o[3]*(-0.015757110897342 + o[4]*(-0.306581069554011 - 0.000960283724907132*o[8])))*tau2 + pi*(4.3870667284435e-7 + o[3]*(-0.00009683303171571 + o[4]*(-0.0090203547252888 - 1.42338887469272*o[8])) + pi*(-7.8847309559367e-10 + (2.558143570457e-8 + 1.44676118155521e-6*tau2)*tau2 + pi*(0.0000160454534363627*o[9] + pi*((-5.0144299353183e-11 + o[10]*(-0.033874355714168 - 836.35096769364*o[11]))*o[3] + pi*((-0.0000138839897890111 - 0.973671060893475*o[12])*o[3]*o[6] + pi*((9.0049690883672e-11 - 296.320827232793*o[13])*o[3]*o[5]*tau2 + pi*(2.57526266427144e-7*o[5]*o[6] + pi*(o[4]*(4.1627860840696e-19 + (-1.0234747095929e-12 - 1.40254511313154e-8*o[5])*o[9]) + o[14]*o[15]*(o[13]*(-2.34560435076256e-9 + 5.3465159397045*o[5]*o[7]*tau2) + o[14]*(-19.1874828272775*o[16]*o[6]*o[7] + o[14]*(o[11]*(1.78371690710842e-23 + (1.07202609066812e-11 - 0.000201611844951398*o[10])*o[3]*o[5]*o[6]*tau2) + pi*(-1.24017662339842e-24*o[5]*o[7] + pi*(0.000200482822351322*o[16]*o[5]*o[7] + pi*(-4.97975748452559e-14*o[16]*o[3]*o[5] + o[6]*o[7]*(1.90027787547159e-27 + o[12]*(2.21658861403112e-15 - 0.0000547344301999018*o[3]*o[7]))*pi*tau2)))))))))))))))));
            end hofpT2;

            function handsofpT2 "Function for isentropic specific enthalpy and specific entropy in region 2"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              output SI.SpecificEnthalpy h "Specific enthalpy";
              output SI.SpecificEntropy s "Specific entropy";
            protected
              Real o[22] "Vector of auxiliary variables";
              Real pi "Dimensionless pressure";
              Real tau "Dimensionless temperature";
              Real tau2 "Dimensionless temperature";
              Real g "Dimensionless Gibbs energy";
              Real gtau "Derivative of dimensionless Gibbs energy w.r.t. tau";
            algorithm
              assert(p > triple.ptriple, "IF97 medium function handsofpT2 called with too low pressure\n" + "p = " + String(p) + " Pa <= " + String(triple.ptriple) + " Pa (triple point pressure)");
              tau := data.TSTAR2/T;
              pi := p/data.PSTAR2;
              tau2 := tau - 0.5;
              o[1] := tau2*tau2;
              o[2] := o[1]*tau2;
              o[3] := o[1]*o[1];
              o[4] := o[3]*o[3];
              o[5] := o[4]*o[4];
              o[6] := o[3]*o[4]*o[5]*tau2;
              o[7] := o[1]*o[3]*tau2;
              o[8] := o[3]*o[4]*tau2;
              o[9] := o[1]*o[5]*tau2;
              o[10] := o[1]*o[3]*o[4];
              o[11] := o[3]*o[4]*o[5];
              o[12] := o[1]*o[3];
              o[13] := pi*pi;
              o[14] := o[13]*o[13];
              o[15] := o[13]*o[14];
              o[16] := o[3]*o[5]*tau2;
              o[17] := o[5]*o[5];
              o[18] := o[3]*o[5];
              o[19] := o[1]*o[3]*o[4]*tau2;
              o[20] := o[1]*o[5];
              o[21] := tau*tau;
              o[22] := o[21]*o[21];
              g := pi*(-0.0017731742473213 + tau2*(-0.017834862292358 + tau2*(-0.045996013696365 + (-0.057581259083432 - 0.05032527872793*o[2])*tau2)) + pi*(tau2*(-0.000033032641670203 + (-0.00018948987516315 + o[1]*(-0.0039392777243355 + o[2]*(-0.043797295650573 - 0.000026674547914087*o[6])))*tau2) + pi*(2.0481737692309e-8 + (4.3870667284435e-7 + o[1]*(-0.00003227767723857 + o[2]*(-0.0015033924542148 - 0.040668253562649*o[6])))*tau2 + pi*(tau2*(-7.8847309559367e-10 + (1.2790717852285e-8 + 4.8225372718507e-7*tau2)*tau2) + pi*(2.2922076337661e-6*o[7] + pi*(o[2]*(-1.6714766451061e-11 + o[8]*(-0.0021171472321355 - 23.895741934104*o[9])) + pi*(-5.905956432427e-18 + o[1]*(-1.2621808899101e-6 - 0.038946842435739*o[10])*o[4]*tau2 + pi*((1.1256211360459e-11 - 8.2311340897998*o[11])*o[4] + pi*(1.9809712802088e-8*o[8] + pi*((1.0406965210174e-19 + o[12]*(-1.0234747095929e-13 - 1.0018179379511e-9*o[3]))*o[3] + o[15]*((-8.0882908646985e-11 + 0.10693031879409*o[16])*o[6] + o[13]*(-0.33662250574171*o[17]*o[4]*o[5]*tau2 + o[13]*(o[18]*(8.9185845355421e-25 + o[19]*(3.0629316876232e-13 - 4.2002467698208e-6*o[8])) + pi*(-5.9056029685639e-26*o[16] + pi*(3.7826947613457e-6*o[17]*o[3]*o[5]*tau2 + pi*(o[1]*(7.3087610595061e-29 + o[10]*(5.5414715350778e-17 - 9.436970724121e-7*o[20]))*o[4]*o[5]*pi - 1.2768608934681e-15*o[1]*o[17]*o[3]*tau2)))))))))))))))) + (-0.00560879118302 + tau*(0.07145273881455 + tau*(-0.4071049823928 + tau*(1.424081971444 + tau*(-4.38395111945 + tau*(-9.692768600217 + tau*(10.08665568018 + (-0.2840863260772 + 0.02126846353307*tau)*tau) + Modelica.Math.log(pi)))))))/(o[22]*tau);
              gtau := (0.0280439559151 + tau*(-0.2858109552582 + tau*(1.2213149471784 + tau*(-2.848163942888 + tau*(4.38395111945 + o[21]*(10.08665568018 + (-0.5681726521544 + 0.06380539059921*tau)*tau))))))/(o[21]*o[22]) + pi*(-0.017834862292358 + tau2*(-0.09199202739273 + (-0.172743777250296 - 0.30195167236758*o[2])*tau2) + pi*(-0.000033032641670203 + (-0.0003789797503263 + o[1]*(-0.015757110897342 + o[2]*(-0.306581069554011 - 0.000960283724907132*o[6])))*tau2 + pi*(4.3870667284435e-7 + o[1]*(-0.00009683303171571 + o[2]*(-0.0090203547252888 - 1.42338887469272*o[6])) + pi*(-7.8847309559367e-10 + (2.558143570457e-8 + 1.44676118155521e-6*tau2)*tau2 + pi*(0.0000160454534363627*o[12] + pi*(o[1]*(-5.0144299353183e-11 + o[8]*(-0.033874355714168 - 836.35096769364*o[9])) + pi*(o[1]*(-0.0000138839897890111 - 0.973671060893475*o[10])*o[4] + pi*((9.0049690883672e-11 - 296.320827232793*o[11])*o[7] + pi*(2.57526266427144e-7*o[3]*o[4] + pi*(o[2]*(4.1627860840696e-19 + o[12]*(-1.0234747095929e-12 - 1.40254511313154e-8*o[3])) + o[15]*(o[11]*(-2.34560435076256e-9 + 5.3465159397045*o[16]) + o[13]*(-19.1874828272775*o[17]*o[4]*o[5] + o[13]*((1.78371690710842e-23 + o[19]*(1.07202609066812e-11 - 0.000201611844951398*o[8]))*o[9] + pi*(-1.24017662339842e-24*o[18] + pi*(0.000200482822351322*o[17]*o[3]*o[5] + pi*(-4.97975748452559e-14*o[1]*o[17]*o[3] + (1.90027787547159e-27 + o[10]*(2.21658861403112e-15 - 0.0000547344301999018*o[20]))*o[4]*o[5]*pi*tau2))))))))))))))));
              h := data.RH2O*T*tau*gtau;
              s := data.RH2O*(tau*gtau - g);
            end handsofpT2;
          end Isentropic;

          package Inverses "Efficient inverses for selected pairs of variables"
            extends Modelica.Icons.FunctionsPackage;

            function fixdT "Region limits for inverse iteration in region 3"
              extends Modelica.Icons.Function;
              input SI.Density din "Density";
              input SI.Temperature Tin "Temperature";
              output SI.Density dout "Density";
              output SI.Temperature Tout "Temperature";
            protected
              SI.Temperature Tmin "Approximation of minimum temperature";
              SI.Temperature Tmax "Approximation of maximum temperature";
            algorithm
              if (din > 765.0) then
                dout := 765.0;
              elseif (din < 110.0) then
                dout := 110.0;
              else
                dout := din;
              end if;
              if (dout < 390.0) then
                Tmax := 554.3557377 + dout*0.809344262;
              else
                Tmax := 1116.85 - dout*0.632948717;
              end if;
              if (dout < data.DCRIT) then
                Tmin := data.TCRIT*(1.0 - (dout - data.DCRIT)*(dout - data.DCRIT)/1.0e6);
              else
                Tmin := data.TCRIT*(1.0 - (dout - data.DCRIT)*(dout - data.DCRIT)/1.44e6);
              end if;
              if (Tin < Tmin) then
                Tout := Tmin;
              elseif (Tin > Tmax) then
                Tout := Tmax;
              else
                Tout := Tin;
              end if;
            end fixdT;

            function dofp13 "Density at the boundary between regions 1 and 3"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.Density d "Density";
            protected
              Real p2 "Auxiliary variable";
              Real o[3] "Vector of auxiliary variables";
            algorithm
              p2 := 7.1 - 6.04960677555959e-8*p;
              o[1] := p2*p2;
              o[2] := o[1]*o[1];
              o[3] := o[2]*o[2];
              d := 57.4756752485113/(0.0737412153522555 + p2*(0.00145092247736023 + p2*(0.000102697173772229 + p2*(0.0000114683182476084 + p2*(1.99080616601101e-6 + o[1]*p2*(1.13217858826367e-8 + o[2]*o[3]*p2*(1.35549330686006e-17 + o[1]*(-3.11228834832975e-19 + o[1]*o[2]*(-7.02987180039442e-22 + p2*(3.29199117056433e-22 + (-5.17859076694812e-23 + 2.73712834080283e-24*p2)*p2))))))))));
            end dofp13;

            function dofp23 "Density at the boundary between regions 2 and 3"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              output SI.Density d "Density";
            protected
              SI.Temperature T;
              Real o[13] "Vector of auxiliary variables";
              Real taug "Auxiliary variable";
              Real pi "Dimensionless pressure";
              Real gpi23 "Derivative of g w.r.t. pi on the boundary between regions 2 and 3";
            algorithm
              pi := p/data.PSTAR2;
              T := 572.54459862746 + 31.3220101646784*(-13.91883977887 + pi)^0.5;
              o[1] := (-13.91883977887 + pi)^0.5;
              taug := -0.5 + 540.0/(572.54459862746 + 31.3220101646784*o[1]);
              o[2] := taug*taug;
              o[3] := o[2]*taug;
              o[4] := o[2]*o[2];
              o[5] := o[4]*o[4];
              o[6] := o[5]*o[5];
              o[7] := o[4]*o[5]*o[6]*taug;
              o[8] := o[4]*o[5]*taug;
              o[9] := o[2]*o[4]*o[5];
              o[10] := pi*pi;
              o[11] := o[10]*o[10];
              o[12] := o[4]*o[6]*taug;
              o[13] := o[6]*o[6];
              gpi23 := (1.0 + pi*(-0.0017731742473213 + taug*(-0.017834862292358 + taug*(-0.045996013696365 + (-0.057581259083432 - 0.05032527872793*o[3])*taug)) + pi*(taug*(-0.000066065283340406 + (-0.0003789797503263 + o[2]*(-0.007878555448671 + o[3]*(-0.087594591301146 - 0.000053349095828174*o[7])))*taug) + pi*(6.1445213076927e-8 + (1.31612001853305e-6 + o[2]*(-0.00009683303171571 + o[3]*(-0.0045101773626444 - 0.122004760687947*o[7])))*taug + pi*(taug*(-3.15389238237468e-9 + (5.116287140914e-8 + 1.92901490874028e-6*taug)*taug) + pi*(0.0000114610381688305*o[2]*o[4]*taug + pi*(o[3]*(-1.00288598706366e-10 + o[8]*(-0.012702883392813 - 143.374451604624*o[2]*o[6]*taug)) + pi*(-4.1341695026989e-17 + o[2]*o[5]*(-8.8352662293707e-6 - 0.272627897050173*o[9])*taug + pi*(o[5]*(9.0049690883672e-11 - 65.8490727183984*o[4]*o[5]*o[6]) + pi*(1.78287415218792e-7*o[8] + pi*(o[4]*(1.0406965210174e-18 + o[2]*(-1.0234747095929e-12 - 1.0018179379511e-8*o[4])*o[4]) + o[10]*o[11]*((-1.29412653835176e-9 + 1.71088510070544*o[12])*o[7] + o[10]*(-6.05920510335078*o[13]*o[5]*o[6]*taug + o[10]*(o[4]*o[6]*(1.78371690710842e-23 + o[2]*o[4]*o[5]*(6.1258633752464e-12 - 0.000084004935396416*o[8])*taug) + pi*(-1.24017662339842e-24*o[12] + pi*(0.0000832192847496054*o[13]*o[4]*o[6]*taug + pi*(o[2]*o[5]*o[6]*(1.75410265428146e-27 + (1.32995316841867e-15 - 0.0000226487297378904*o[2]*o[6])*o[9])*pi - 2.93678005497663e-14*o[13]*o[2]*o[4]*taug)))))))))))))))))/pi;
              d := p/(data.RH2O*T*pi*gpi23);
            end dofp23;

            function dofpt3 "Inverse iteration in region 3: (d) = f(p,T)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.Temperature T "Temperature (K)";
              input SI.Pressure delp "Iteration converged if (p-pre(p) < delp)";
              output SI.Density d "Density";
              output Integer error = 0 "Error flag: iteration failed if different from 0";
            protected
              SI.Density dguess "Guess density";
              Integer i = 0 "Loop counter";
              Real dp "Pressure difference";
              SI.Density deld "Density step";
              Modelica.Media.Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
              Modelica.Media.Common.NewtonDerivatives_pT nDerivs "Derivatives needed in Newton iteration";
              Boolean found = false "Flag for iteration success";
              Boolean supercritical "Flag, true for supercritical states";
              Boolean liquid "Flag, true for liquid states";
              SI.Density dmin "Lower density limit";
              SI.Density dmax "Upper density limit";
              SI.Temperature Tmax "Maximum temperature";
              Real damping "Damping factor";
            algorithm
              found := false;
              assert(p >= data.PLIMIT4A, "BaseIF97.dofpt3: function called outside of region 3! p too low\n" + "p = " + String(p) + " Pa < " + String(data.PLIMIT4A) + " Pa");
              assert(T >= data.TLIMIT1, "BaseIF97.dofpt3: function called outside of region 3! T too low\n" + "T = " + String(T) + " K < " + String(data.TLIMIT1) + " K");
              assert(p >= Regions.boundary23ofT(T), "BaseIF97.dofpt3: function called outside of region 3! T too high\n" + "p = " + String(p) + " Pa, T = " + String(T) + " K");
              supercritical := p > data.PCRIT;
              damping := if supercritical then 1.0 else 1.0;
              Tmax := Regions.boundary23ofp(p);
              if supercritical then
                dmax := dofp13(p);
                dmin := dofp23(p);
                dguess := dmax - (T - data.TLIMIT1)/(data.TLIMIT1 - Tmax)*(dmax - dmin);
              else
                liquid := T < Basic.tsat(p);
                if liquid then
                  dmax := dofp13(p);
                  dmin := Regions.rhol_p_R4b(p);
                  dguess := 1.1*Regions.rhol_T(T) "Guess: 10 percent more than on the phase boundary for same T";
                else
                  dmax := Regions.rhov_p_R4b(p);
                  dmin := dofp23(p);
                  dguess := 0.9*Regions.rhov_T(T) "Guess: 10% less than on the phase boundary for same T";
                end if;
              end if;
              while ((i < IterationData.IMAX) and not found) loop
                d := dguess;
                f := Basic.f3(d, T);
                nDerivs := Modelica.Media.Common.Helmholtz_pT(f);
                dp := nDerivs.p - p;
                if (abs(dp/p) <= delp) then
                  found := true;
                else
                end if;
                deld := dp/nDerivs.pd*damping;
                d := d - deld;
                if d > dmin and d < dmax then
                  dguess := d;
                else
                  if d > dmax then
                    dguess := dmax - sqrt(Modelica.Constants.eps);
                  else
                    dguess := dmin + sqrt(Modelica.Constants.eps);
                  end if;
                end if;
                i := i + 1;
              end while;
              if not found then
                error := 1;
              else
              end if;
              assert(error <> 1, "Error in inverse function dofpt3: iteration failed");
            end dofpt3;

            function dtofph3 "Inverse iteration in region 3: (d,T) = f(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              input SI.Pressure delp "Iteration accuracy";
              input SI.SpecificEnthalpy delh "Iteration accuracy";
              output SI.Density d "Density";
              output SI.Temperature T "Temperature (K)";
              output Integer error "Error flag: iteration failed if different from 0";
            protected
              SI.Temperature Tguess "Initial temperature";
              SI.Density dguess "Initial density";
              Integer i "Iteration counter";
              Real dh "Newton-error in h-direction";
              Real dp "Newton-error in p-direction";
              Real det "Determinant of directional derivatives";
              Real deld "Newton-step in d-direction";
              Real delt "Newton-step in T-direction";
              Modelica.Media.Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
              Modelica.Media.Common.NewtonDerivatives_ph nDerivs "Derivatives needed in Newton iteration";
              Boolean found = false "Flag for iteration success";
              Integer subregion "1 for subregion 3a, 2 for subregion 3b";
            algorithm
              if p < data.PCRIT then
                subregion := if h < (Regions.hl_p(p) + 10.0) then 1 else if h > (Regions.hv_p(p) - 10.0) then 2 else 0;
                assert(subregion <> 0, "Inverse iteration of dt from ph called in 2 phase region: this can not work");
              else
                subregion := if h < Basic.h3ab_p(p) then 1 else 2;
              end if;
              T := if subregion == 1 then Basic.T3a_ph(p, h) else Basic.T3b_ph(p, h);
              d := if subregion == 1 then 1/Basic.v3a_ph(p, h) else 1/Basic.v3b_ph(p, h);
              i := 0;
              error := 0;
              while ((i < IterationData.IMAX) and not found) loop
                f := Basic.f3(d, T);
                nDerivs := Modelica.Media.Common.Helmholtz_ph(f);
                dh := nDerivs.h - h;
                dp := nDerivs.p - p;
                if ((abs(dh/h) <= delh) and (abs(dp/p) <= delp)) then
                  found := true;
                else
                end if;
                det := nDerivs.ht*nDerivs.pd - nDerivs.pt*nDerivs.hd;
                delt := (nDerivs.pd*dh - nDerivs.hd*dp)/det;
                deld := (nDerivs.ht*dp - nDerivs.pt*dh)/det;
                T := T - delt;
                d := d - deld;
                dguess := d;
                Tguess := T;
                i := i + 1;
                (d, T) := fixdT(dguess, Tguess);
              end while;
              if not found then
                error := 1;
              else
              end if;
              assert(error <> 1, "Error in inverse function dtofph3: iteration failed");
            end dtofph3;

            function dtofps3 "Inverse iteration in region 3: (d,T) = f(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              input SI.Pressure delp "Iteration accuracy";
              input SI.SpecificEntropy dels "Iteration accuracy";
              output SI.Density d "Density";
              output SI.Temperature T "Temperature (K)";
              output Integer error "Error flag: iteration failed if different from 0";
            protected
              SI.Temperature Tguess "Initial temperature";
              SI.Density dguess "Initial density";
              Integer i "Iteration counter";
              Real ds "Newton-error in s-direction";
              Real dp "Newton-error in p-direction";
              Real det "Determinant of directional derivatives";
              Real deld "Newton-step in d-direction";
              Real delt "Newton-step in T-direction";
              Modelica.Media.Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
              Modelica.Media.Common.NewtonDerivatives_ps nDerivs "Derivatives needed in Newton iteration";
              Boolean found "Flag for iteration success";
              Integer subregion "1 for subregion 3a, 2 for subregion 3b";
            algorithm
              i := 0;
              error := 0;
              found := false;
              if p < data.PCRIT then
                subregion := if s < (Regions.sl_p(p) + 10.0) then 1 else if s > (Regions.sv_p(p) - 10.0) then 2 else 0;
                assert(subregion <> 0, "Inverse iteration of dt from ps called in 2 phase region: this is illegal!");
              else
                subregion := if s < data.SCRIT then 1 else 2;
              end if;
              T := if subregion == 1 then Basic.T3a_ps(p, s) else Basic.T3b_ps(p, s);
              d := if subregion == 1 then 1/Basic.v3a_ps(p, s) else 1/Basic.v3b_ps(p, s);
              while ((i < IterationData.IMAX) and not found) loop
                f := Basic.f3(d, T);
                nDerivs := Modelica.Media.Common.Helmholtz_ps(f);
                ds := nDerivs.s - s;
                dp := nDerivs.p - p;
                if ((abs(ds/s) <= dels) and (abs(dp/p) <= delp)) then
                  found := true;
                else
                end if;
                det := nDerivs.st*nDerivs.pd - nDerivs.pt*nDerivs.sd;
                delt := (nDerivs.pd*ds - nDerivs.sd*dp)/det;
                deld := (nDerivs.st*dp - nDerivs.pt*ds)/det;
                T := T - delt;
                d := d - deld;
                dguess := d;
                Tguess := T;
                i := i + 1;
                (d, T) := fixdT(dguess, Tguess);
              end while;
              if not found then
                error := 1;
              else
              end if;
              assert(error <> 1, "Error in inverse function dtofps3: iteration failed");
            end dtofps3;

            function pofdt125 "Inverse iteration in region 1,2 and 5: p = g(d,T)"
              extends Modelica.Icons.Function;
              input SI.Density d "Density";
              input SI.Temperature T "Temperature (K)";
              input SI.Pressure reldd "Relative iteration accuracy of density";
              input Integer region "Region in IAPWS/IF97 in which inverse should be calculated";
              output SI.Pressure p "Pressure";
              output Integer error "Error flag: iteration failed if different from 0";
            protected
              Integer i "Counter for while-loop";
              Modelica.Media.Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
              Boolean found "Flag if iteration has been successful";
              Real dd "Difference between density for guessed p and the current density";
              Real delp "Step in p in Newton-iteration";
              Real relerr "Relative error in d";
              SI.Pressure pguess1 = 1.0e6 "Initial pressure guess in region 1";
              SI.Pressure pguess2 "Initial pressure guess in region 2";
              constant SI.Pressure pguess5 = 0.5e6 "Initial pressure guess in region 5";
            algorithm
              i := 0;
              error := 0;
              pguess2 := 42800*d;
              found := false;
              if region == 1 then
                p := pguess1;
              elseif region == 2 then
                p := pguess2;
              else
                p := pguess5;
              end if;
              while ((i < IterationData.IMAX) and not found) loop
                if region == 1 then
                  g := Basic.g1(p, T);
                elseif region == 2 then
                  g := Basic.g2(p, T);
                else
                  g := Basic.g5(p, T);
                end if;
                dd := p/(data.RH2O*T*g.pi*g.gpi) - d;
                relerr := dd/d;
                if (abs(relerr) < reldd) then
                  found := true;
                else
                end if;
                delp := dd*(-p*p/(d*d*data.RH2O*T*g.pi*g.pi*g.gpipi));
                p := p - delp;
                i := i + 1;
                if not found then
                  if p < triple.ptriple then
                    p := 2.0*triple.ptriple;
                  else
                  end if;
                  if p > data.PLIMIT1 then
                    p := 0.95*data.PLIMIT1;
                  else
                  end if;
                else
                end if;
              end while;
              if not found then
                error := 1;
              else
              end if;
              assert(error <> 1, "Error in inverse function pofdt125: iteration failed");
            end pofdt125;

            function tofph5 "Inverse iteration in region 5: (p,T) = f(p,h)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEnthalpy h "Specific enthalpy";
              input SI.SpecificEnthalpy reldh "Iteration accuracy";
              output SI.Temperature T "Temperature (K)";
              output Integer error "Error flag: iteration failed if different from 0";
            protected
              Modelica.Media.Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
              SI.SpecificEnthalpy proh "H for current guess in T";
              constant SI.Temperature Tguess = 1500 "Initial temperature";
              Integer i "Iteration counter";
              Real relerr "Relative error in h";
              Real dh "Newton-error in h-direction";
              Real dT "Newton-step in T-direction";
              Boolean found "Flag for iteration success";
            algorithm
              i := 0;
              error := 0;
              T := Tguess;
              found := false;
              while ((i < IterationData.IMAX) and not found) loop
                g := Basic.g5(p, T);
                proh := data.RH2O*T*g.tau*g.gtau;
                dh := proh - h;
                relerr := dh/h;
                if (abs(relerr) < reldh) then
                  found := true;
                else
                end if;
                dT := dh/(-data.RH2O*g.tau*g.tau*g.gtautau);
                T := T - dT;
                i := i + 1;
              end while;
              if not found then
                error := 1;
              else
              end if;
              assert(error <> 1, "Error in inverse function tofph5: iteration failed");
            end tofph5;

            function tofps5 "Inverse iteration in region 5: (p,T) = f(p,s)"
              extends Modelica.Icons.Function;
              input SI.Pressure p "Pressure";
              input SI.SpecificEntropy s "Specific entropy";
              input SI.SpecificEnthalpy relds "Iteration accuracy";
              output SI.Temperature T "Temperature (K)";
              output Integer error "Error flag: iteration failed if different from 0";
            protected
              Modelica.Media.Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
              SI.SpecificEntropy pros "S for current guess in T";
              parameter SI.Temperature Tguess = 1500 "Initial temperature";
              Integer i "Iteration counter";
              Real relerr "Relative error in s";
              Real ds "Newton-error in s-direction";
              Real dT "Newton-step in T-direction";
              Boolean found "Flag for iteration success";
            algorithm
              i := 0;
              error := 0;
              T := Tguess;
              found := false;
              while ((i < IterationData.IMAX) and not found) loop
                g := Basic.g5(p, T);
                pros := data.RH2O*(g.tau*g.gtau - g.g);
                ds := pros - s;
                relerr := ds/s;
                if (abs(relerr) < relds) then
                  found := true;
                else
                end if;
                dT := ds*T/(-data.RH2O*g.tau*g.tau*g.gtautau);
                T := T - dT;
                i := i + 1;
              end while;
              if not found then
                error := 1;
              else
              end if;
              assert(error <> 1, "Error in inverse function tofps5: iteration failed");
            end tofps5;
          end Inverses;
        end BaseIF97;

        function waterBaseProp_ph "Intermediate property record for water"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "Phase: 2 for two-phase, 1 for one phase, 0 if unknown";
          input Integer region = 0 "If 0, do region computation, otherwise assume the region is this input";
          output Common.IF97BaseTwoPhase aux "Auxiliary record";
        protected
          Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Integer error "Error flag for inverse iterations";
          SI.SpecificEnthalpy h_liq "Liquid specific enthalpy";
          SI.Density d_liq "Liquid density";
          SI.SpecificEnthalpy h_vap "Vapour specific enthalpy";
          SI.Density d_vap "Vapour density";
          Common.PhaseBoundaryProperties liq "Phase boundary property record";
          Common.PhaseBoundaryProperties vap "Phase boundary property record";
          Common.GibbsDerivs gl "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Common.GibbsDerivs gv "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Modelica.Media.Common.HelmholtzDerivs fl "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Modelica.Media.Common.HelmholtzDerivs fv "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          SI.Temperature t1 "Temperature at phase boundary, using inverse from region 1";
          SI.Temperature t2 "Temperature at phase boundary, using inverse from region 2";
        algorithm
          aux.region := if region == 0 then (if phase == 2 then 4 else BaseIF97.Regions.region_ph(p = p, h = h, phase = phase)) else region;
          aux.phase := if phase <> 0 then phase else if aux.region == 4 then 2 else 1;
          aux.p := max(p, 611.657);
          aux.h := max(h, 1e3);
          aux.R_s := BaseIF97.data.RH2O;
          aux.vt := 0.0 "Initialized in case it is not needed";
          aux.vp := 0.0 "Initialized in case it is not needed";
          if (aux.region == 1) then
            aux.T := BaseIF97.Basic.tph1(aux.p, aux.h);
            g := BaseIF97.Basic.g1(p, aux.T);
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := p/(aux.R_s*aux.T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.vp := aux.R_s*aux.T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 0.0;
            aux.dpT := -aux.vt/aux.vp;
          elseif (aux.region == 2) then
            aux.T := BaseIF97.Basic.tph2(aux.p, aux.h);
            g := BaseIF97.Basic.g2(p, aux.T);
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := p/(aux.R_s*aux.T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*aux.T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 1.0;
            aux.dpT := -aux.vt/aux.vp;
          elseif (aux.region == 3) then
            (aux.rho, aux.T, error) := BaseIF97.Inverses.dtofph3(p = aux.p, h = aux.h, delp = 1.0e-7, delh = 1.0e-6);
            f := BaseIF97.Basic.f3(aux.rho, aux.T);
            aux.h := aux.R_s*aux.T*(f.tau*f.ftau + f.delta*f.fdelta);
            aux.s := aux.R_s*(f.tau*f.ftau - f.f);
            aux.pd := aux.R_s*aux.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
            aux.pt := aux.R_s*aux.rho*f.delta*(f.fdelta - f.tau*f.fdeltatau);
            aux.cv := abs(aux.R_s*(-f.tau*f.tau*f.ftautau)) "Can be close to neg. infinity near critical point";
            aux.cp := (aux.rho*aux.rho*aux.pd*aux.cv + aux.T*aux.pt*aux.pt)/(aux.rho*aux.rho*aux.pd);
            aux.x := 0.0;
            aux.dpT := aux.pt;
          elseif (aux.region == 4) then
            h_liq := hl_p(p);
            h_vap := hv_p(p);
            aux.x := if (h_vap <> h_liq) then (h - h_liq)/(h_vap - h_liq) else 1.0;
            if p < BaseIF97.data.PLIMIT4A then
              t1 := BaseIF97.Basic.tph1(aux.p, h_liq);
              t2 := BaseIF97.Basic.tph2(aux.p, h_vap);
              gl := BaseIF97.Basic.g1(aux.p, t1);
              gv := BaseIF97.Basic.g2(aux.p, t2);
              liq := Common.gibbsToBoundaryProps(gl);
              vap := Common.gibbsToBoundaryProps(gv);
              aux.T := t1 + aux.x*(t2 - t1);
            else
              aux.T := BaseIF97.Basic.tsat(aux.p);
              d_liq := rhol_T(aux.T);
              d_vap := rhov_T(aux.T);
              fl := BaseIF97.Basic.f3(d_liq, aux.T);
              fv := BaseIF97.Basic.f3(d_vap, aux.T);
              liq := Common.helmholtzToBoundaryProps(fl);
              vap := Common.helmholtzToBoundaryProps(fv);
            end if;
            aux.dpT := if (liq.d <> vap.d) then (vap.s - liq.s)*liq.d*vap.d/(liq.d - vap.d) else BaseIF97.Basic.dptofT(aux.T);
            aux.s := liq.s + aux.x*(vap.s - liq.s);
            aux.rho := liq.d*vap.d/(vap.d + aux.x*(liq.d - vap.d));
            aux.cv := Common.cv2Phase(liq, vap, aux.x, aux.T, p);
            aux.cp := liq.cp + aux.x*(vap.cp - liq.cp);
            aux.pt := liq.pt + aux.x*(vap.pt - liq.pt);
            aux.pd := liq.pd + aux.x*(vap.pd - liq.pd);
          elseif (aux.region == 5) then
            (aux.T, error) := BaseIF97.Inverses.tofph5(p = aux.p, h = aux.h, reldh = 1.0e-7);
            assert(error == 0, "Error in inverse iteration of steam tables");
            g := BaseIF97.Basic.g5(aux.p, aux.T);
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := p/(aux.R_s*aux.T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*aux.T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.dpT := -aux.vt/aux.vp;
          else
            assert(false, "Error in region computation of IF97 steam tables" + "(p = " + String(p) + ", h = " + String(h) + ")");
          end if;
        end waterBaseProp_ph;

        function waterBaseProp_ps "Intermediate property record for water"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Integer phase = 0 "Phase: 2 for two-phase, 1 for one phase, 0 if unknown";
          input Integer region = 0 "If 0, do region computation, otherwise assume the region is this input";
          output Common.IF97BaseTwoPhase aux "Auxiliary record";
        protected
          Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Integer error "Error flag for inverse iterations";
          SI.SpecificEntropy s_liq "Liquid specific entropy";
          SI.Density d_liq "Liquid density";
          SI.SpecificEntropy s_vap "Vapour specific entropy";
          SI.Density d_vap "Vapour density";
          Common.PhaseBoundaryProperties liq "Phase boundary property record";
          Common.PhaseBoundaryProperties vap "Phase boundary property record";
          Common.GibbsDerivs gl "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Common.GibbsDerivs gv "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Modelica.Media.Common.HelmholtzDerivs fl "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Modelica.Media.Common.HelmholtzDerivs fv "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          SI.Temperature t1 "Temperature at phase boundary, using inverse from region 1";
          SI.Temperature t2 "Temperature at phase boundary, using inverse from region 2";
        algorithm
          aux.region := if region == 0 then (if phase == 2 then 4 else BaseIF97.Regions.region_ps(p = p, s = s, phase = phase)) else region;
          aux.phase := if phase <> 0 then phase else if aux.region == 4 then 2 else 1;
          aux.p := p;
          aux.s := s;
          aux.R_s := BaseIF97.data.RH2O;
          aux.vt := 0.0 "Initialized in case it is not needed";
          aux.vp := 0.0 "Initialized in case it is not needed";
          if (aux.region == 1) then
            aux.T := BaseIF97.Basic.tps1(p, s);
            g := BaseIF97.Basic.g1(p, aux.T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.rho := p/(aux.R_s*aux.T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*aux.T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 0.0;
            aux.dpT := -aux.vt/aux.vp;
          elseif (aux.region == 2) then
            aux.T := BaseIF97.Basic.tps2(p, s);
            g := BaseIF97.Basic.g2(p, aux.T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.rho := p/(aux.R_s*aux.T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*aux.T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 1.0;
            aux.dpT := -aux.vt/aux.vp;
          elseif (aux.region == 3) then
            (aux.rho, aux.T, error) := BaseIF97.Inverses.dtofps3(p = p, s = s, delp = 1.0e-7, dels = 1.0e-6);
            f := BaseIF97.Basic.f3(aux.rho, aux.T);
            aux.h := aux.R_s*aux.T*(f.tau*f.ftau + f.delta*f.fdelta);
            aux.s := aux.R_s*(f.tau*f.ftau - f.f);
            aux.pd := aux.R_s*aux.T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
            aux.pt := aux.R_s*aux.rho*f.delta*(f.fdelta - f.tau*f.fdeltatau);
            aux.cv := aux.R_s*(-f.tau*f.tau*f.ftautau);
            aux.cp := (aux.rho*aux.rho*aux.pd*aux.cv + aux.T*aux.pt*aux.pt)/(aux.rho*aux.rho*aux.pd);
            aux.x := 0.0;
            aux.dpT := aux.pt;
          elseif (aux.region == 4) then
            s_liq := BaseIF97.Regions.sl_p(p);
            s_vap := BaseIF97.Regions.sv_p(p);
            aux.x := if (s_vap <> s_liq) then (s - s_liq)/(s_vap - s_liq) else 1.0;
            if p < BaseIF97.data.PLIMIT4A then
              t1 := BaseIF97.Basic.tps1(p, s_liq);
              t2 := BaseIF97.Basic.tps2(p, s_vap);
              gl := BaseIF97.Basic.g1(p, t1);
              gv := BaseIF97.Basic.g2(p, t2);
              liq := Common.gibbsToBoundaryProps(gl);
              vap := Common.gibbsToBoundaryProps(gv);
              aux.T := t1 + aux.x*(t2 - t1);
            else
              aux.T := BaseIF97.Basic.tsat(p);
              d_liq := rhol_T(aux.T);
              d_vap := rhov_T(aux.T);
              fl := BaseIF97.Basic.f3(d_liq, aux.T);
              fv := BaseIF97.Basic.f3(d_vap, aux.T);
              liq := Common.helmholtzToBoundaryProps(fl);
              vap := Common.helmholtzToBoundaryProps(fv);
            end if;
            aux.dpT := if (liq.d <> vap.d) then (vap.s - liq.s)*liq.d*vap.d/(liq.d - vap.d) else BaseIF97.Basic.dptofT(aux.T);
            aux.h := liq.h + aux.x*(vap.h - liq.h);
            aux.rho := liq.d*vap.d/(vap.d + aux.x*(liq.d - vap.d));
            aux.cv := Common.cv2Phase(liq, vap, aux.x, aux.T, p);
            aux.cp := liq.cp + aux.x*(vap.cp - liq.cp);
            aux.pt := liq.pt + aux.x*(vap.pt - liq.pt);
            aux.pd := liq.pd + aux.x*(vap.pd - liq.pd);
          elseif (aux.region == 5) then
            (aux.T, error) := BaseIF97.Inverses.tofps5(p = p, s = s, relds = 1.0e-7);
            assert(error == 0, "Error in inverse iteration of steam tables");
            g := BaseIF97.Basic.g5(p, aux.T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.rho := p/(aux.R_s*aux.T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*aux.T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.dpT := -aux.vt/aux.vp;
            aux.x := 1.0;
          else
            assert(false, "Error in region computation of IF97 steam tables" + "(p = " + String(p) + ", s = " + String(s) + ")");
          end if;
        end waterBaseProp_ps;

        function rho_props_ps "Density as function of pressure and specific entropy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          output SI.Density rho "Density";
        algorithm
          rho := properties.rho;
          annotation(Inline = false, LateInline = true);
        end rho_props_ps;

        function rho_ps "Density as function of pressure and specific entropy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Density rho "Density";
        algorithm
          rho := rho_props_ps(p, s, waterBaseProp_ps(p, s, phase, region));
          annotation(Inline = true);
        end rho_ps;

        function T_props_ps "Temperature as function of pressure and specific entropy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          output SI.Temperature T "Temperature";
        algorithm
          T := properties.T;
          annotation(Inline = false, LateInline = true);
        end T_props_ps;

        function T_ps "Temperature as function of pressure and specific entropy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Temperature T "Temperature";
        algorithm
          T := T_props_ps(p, s, waterBaseProp_ps(p, s, phase, region));
          annotation(Inline = true);
        end T_ps;

        function h_props_ps "Specific enthalpy as function or pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := aux.h;
          annotation(Inline = false, LateInline = true);
        end h_props_ps;

        function h_ps "Specific enthalpy as function or pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := h_props_ps(p, s, waterBaseProp_ps(p, s, phase, region));
          annotation(Inline = true);
        end h_ps;

        function rho_props_ph "Density as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          output SI.Density rho "Density";
        algorithm
          rho := properties.rho;
          annotation(derivative(noDerivative = properties) = rho_ph_der, Inline = false, LateInline = true);
        end rho_props_ph;

        function rho_ph "Density as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Density rho "Density";
        algorithm
          rho := rho_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end rho_ph;

        function rho_ph_der "Derivative function of rho_ph"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          input Real p_der "Derivative of pressure";
          input Real h_der "Derivative of specific enthalpy";
          output Real rho_der "Derivative of density";
        algorithm
          if (properties.region == 4) then
            rho_der := (properties.rho*(properties.rho*properties.cv/properties.dpT + 1.0)/(properties.dpT*properties.T))*p_der + (-properties.rho*properties.rho/(properties.dpT*properties.T))*h_der;
          elseif (properties.region == 3) then
            rho_der := ((properties.rho*(properties.cv*properties.rho + properties.pt))/(properties.rho*properties.rho*properties.pd*properties.cv + properties.T*properties.pt*properties.pt))*p_der + (-properties.rho*properties.rho*properties.pt/(properties.rho*properties.rho*properties.pd*properties.cv + properties.T*properties.pt*properties.pt))*h_der;
          else
            rho_der := (-properties.rho*properties.rho*(properties.vp*properties.cp - properties.vt/properties.rho + properties.T*properties.vt*properties.vt)/properties.cp)*p_der + (-properties.rho*properties.rho*properties.vt/(properties.cp))*h_der;
          end if;
        end rho_ph_der;

        function T_props_ph "Temperature as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          output SI.Temperature T "Temperature";
        algorithm
          T := properties.T;
          annotation(derivative(noDerivative = properties) = T_ph_der, Inline = false, LateInline = true);
        end T_props_ph;

        function T_ph "Temperature as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Temperature T "Temperature";
        algorithm
          T := T_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end T_ph;

        function T_ph_der "Derivative function of T_ph"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          input Real p_der "Derivative of pressure";
          input Real h_der "Derivative of specific enthalpy";
          output Real T_der "Derivative of temperature";
        algorithm
          if (properties.region == 4) then
            T_der := 1/properties.dpT*p_der;
          elseif (properties.region == 3) then
            T_der := ((-properties.rho*properties.pd + properties.T*properties.pt)/(properties.rho*properties.rho*properties.pd*properties.cv + properties.T*properties.pt*properties.pt))*p_der + ((properties.rho*properties.rho*properties.pd)/(properties.rho*properties.rho*properties.pd*properties.cv + properties.T*properties.pt*properties.pt))*h_der;
          else
            T_der := ((-1/properties.rho + properties.T*properties.vt)/properties.cp)*p_der + (1/properties.cp)*h_der;
          end if;
        end T_ph_der;

        function s_props_ph "Specific entropy as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          output SI.SpecificEntropy s "Specific entropy";
        algorithm
          s := properties.s;
          annotation(derivative(noDerivative = properties) = s_ph_der, Inline = false, LateInline = true);
        end s_props_ph;

        function s_ph "Specific entropy as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificEntropy s "Specific entropy";
        algorithm
          s := s_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end s_ph;

        function s_ph_der "Specific entropy as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase properties "Auxiliary record";
          input Real p_der "Derivative of pressure";
          input Real h_der "Derivative of specific enthalpy";
          output Real s_der "Derivative of entropy";
        algorithm
          s_der := -1/(properties.rho*properties.T)*p_der + 1/properties.T*h_der;
          annotation(Inline = true);
        end s_ph_der;

        function cv_props_ph "Specific heat capacity at constant volume as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificHeatCapacity cv "Specific heat capacity";
        algorithm
          cv := aux.cv;
          annotation(Inline = false, LateInline = true);
        end cv_props_ph;

        function cv_ph "Specific heat capacity at constant volume as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificHeatCapacity cv "Specific heat capacity";
        algorithm
          cv := cv_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end cv_ph;

        function cp_props_ph "Specific heat capacity at constant pressure as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificHeatCapacity cp "Specific heat capacity";
        algorithm
          cp := aux.cp;
          annotation(Inline = false, LateInline = true);
        end cp_props_ph;

        function cp_ph "Specific heat capacity at constant pressure as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificHeatCapacity cp "Specific heat capacity";
        algorithm
          cp := cp_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end cp_ph;

        function beta_props_ph "Isobaric expansion coefficient as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.RelativePressureCoefficient beta "Isobaric expansion coefficient";
        algorithm
          beta := if aux.region == 3 or aux.region == 4 then aux.pt/(aux.rho*aux.pd) else aux.vt*aux.rho;
          annotation(Inline = false, LateInline = true);
        end beta_props_ph;

        function beta_ph "Isobaric expansion coefficient as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.RelativePressureCoefficient beta "Isobaric expansion coefficient";
        algorithm
          beta := beta_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end beta_ph;

        function kappa_props_ph "Isothermal compressibility factor as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.IsothermalCompressibility kappa "Isothermal compressibility factor";
        algorithm
          kappa := if aux.region == 3 or aux.region == 4 then 1/(aux.rho*aux.pd) else -aux.vp*aux.rho;
          annotation(Inline = false, LateInline = true);
        end kappa_props_ph;

        function kappa_ph "Isothermal compressibility factor as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.IsothermalCompressibility kappa "Isothermal compressibility factor";
        algorithm
          kappa := kappa_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end kappa_ph;

        function velocityOfSound_props_ph "Speed of sound as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.Velocity v_sound "Speed of sound";
        algorithm
          v_sound := if aux.region == 3 then sqrt(max(0, (aux.pd*aux.rho*aux.rho*aux.cv + aux.pt*aux.pt*aux.T)/(aux.rho*aux.rho*aux.cv))) else if aux.region == 4 then sqrt(max(0, 1/((aux.rho*(aux.rho*aux.cv/aux.dpT + 1.0)/(aux.dpT*aux.T)) - 1/aux.rho*aux.rho*aux.rho/(aux.dpT*aux.T)))) else sqrt(max(0, -aux.cp/(aux.rho*aux.rho*(aux.vp*aux.cp + aux.vt*aux.vt*aux.T))));
          annotation(Inline = false, LateInline = true);
        end velocityOfSound_props_ph;

        function velocityOfSound_ph
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Velocity v_sound "Speed of sound";
        algorithm
          v_sound := velocityOfSound_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end velocityOfSound_ph;

        function isentropicExponent_props_ph "Isentropic exponent as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output Real gamma "Isentropic exponent";
        algorithm
          gamma := if aux.region == 3 then 1/(aux.rho*p)*((aux.pd*aux.cv*aux.rho*aux.rho + aux.pt*aux.pt*aux.T)/(aux.cv)) else if aux.region == 4 then 1/(aux.rho*p)*aux.dpT*aux.dpT*aux.T/aux.cv else -1/(aux.rho*aux.p)*aux.cp/(aux.vp*aux.cp + aux.vt*aux.vt*aux.T);
          annotation(Inline = false, LateInline = true);
        end isentropicExponent_props_ph;

        function isentropicExponent_ph "Isentropic exponent as function of pressure and specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output Real gamma "Isentropic exponent";
        algorithm
          gamma := isentropicExponent_props_ph(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = false, LateInline = true);
        end isentropicExponent_ph;

        function ddph_props "Density derivative by pressure"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.DerDensityByPressure ddph "Density derivative by pressure";
        algorithm
          ddph := if aux.region == 3 then ((aux.rho*(aux.cv*aux.rho + aux.pt))/(aux.rho*aux.rho*aux.pd*aux.cv + aux.T*aux.pt*aux.pt)) else if aux.region == 4 then (aux.rho*(aux.rho*aux.cv/aux.dpT + 1.0)/(aux.dpT*aux.T)) else (-aux.rho*aux.rho*(aux.vp*aux.cp - aux.vt/aux.rho + aux.T*aux.vt*aux.vt)/aux.cp);
          annotation(Inline = false, LateInline = true);
        end ddph_props;

        function ddph "Density derivative by pressure"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.DerDensityByPressure ddph "Density derivative by pressure";
        algorithm
          ddph := ddph_props(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end ddph;

        function ddhp_props "Density derivative by specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.DerDensityByEnthalpy ddhp "Density derivative by specific enthalpy";
        algorithm
          ddhp := if aux.region == 3 then -aux.rho*aux.rho*aux.pt/(aux.rho*aux.rho*aux.pd*aux.cv + aux.T*aux.pt*aux.pt) else if aux.region == 4 then -aux.rho*aux.rho/(aux.dpT*aux.T) else -aux.rho*aux.rho*aux.vt/(aux.cp);
          annotation(Inline = false, LateInline = true);
        end ddhp_props;

        function ddhp "Density derivative by specific enthalpy"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEnthalpy h "Specific enthalpy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.DerDensityByEnthalpy ddhp "Density derivative by specific enthalpy";
        algorithm
          ddhp := ddhp_props(p, h, waterBaseProp_ph(p, h, phase, region));
          annotation(Inline = true);
        end ddhp;

        function waterBaseProp_pT "Intermediate property record for water (p and T preferred states)"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, do region computation, otherwise assume the region is this input";
          output Common.IF97BaseTwoPhase aux "Auxiliary record";
        protected
          Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Integer error "Error flag for inverse iterations";
        algorithm
          aux.phase := 1;
          aux.region := if region == 0 then BaseIF97.Regions.region_pT(p = p, T = T) else region;
          aux.R_s := BaseIF97.data.RH2O;
          aux.p := p;
          aux.T := T;
          aux.vt := 0.0 "Initialized in case it is not needed";
          aux.vp := 0.0 "Initialized in case it is not needed";
          if (aux.region == 1) then
            g := BaseIF97.Basic.g1(p, T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := p/(aux.R_s*T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 0.0;
            aux.dpT := -aux.vt/aux.vp;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
          elseif (aux.region == 2) then
            g := BaseIF97.Basic.g2(p, T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := p/(aux.R_s*T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 1.0;
            aux.dpT := -aux.vt/aux.vp;
          elseif (aux.region == 3) then
            (aux.rho, error) := BaseIF97.Inverses.dofpt3(p = p, T = T, delp = 1.0e-7);
            f := BaseIF97.Basic.f3(aux.rho, T);
            aux.h := aux.R_s*T*(f.tau*f.ftau + f.delta*f.fdelta);
            aux.s := aux.R_s*(f.tau*f.ftau - f.f);
            aux.pd := aux.R_s*T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
            aux.pt := aux.R_s*aux.rho*f.delta*(f.fdelta - f.tau*f.fdeltatau);
            aux.cv := aux.R_s*(-f.tau*f.tau*f.ftautau);
            aux.x := 0.0;
            aux.dpT := aux.pt;
          elseif (aux.region == 5) then
            g := BaseIF97.Basic.g5(p, T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := p/(aux.R_s*T*g.pi*g.gpi);
            aux.vt := aux.R_s/p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*T/(p*p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 1.0;
            aux.dpT := -aux.vt/aux.vp;
          else
            assert(false, "Error in region computation of IF97 steam tables" + "(p = " + String(p) + ", T = " + String(T) + ")");
          end if;
        end waterBaseProp_pT;

        function rho_props_pT "Density as function or pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.Density rho "Density";
        algorithm
          rho := aux.rho;
          annotation(derivative(noDerivative = aux) = rho_pT_der, Inline = false, LateInline = true);
        end rho_props_pT;

        function rho_pT "Density as function or pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Density rho "Density";
        algorithm
          rho := rho_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end rho_pT;

        function h_props_pT "Specific enthalpy as function or pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := aux.h;
          annotation(derivative(noDerivative = aux) = h_pT_der, Inline = false, LateInline = true);
        end h_props_pT;

        function h_pT "Specific enthalpy as function or pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := h_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end h_pT;

        function h_pT_der "Derivative function of h_pT"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          input Real p_der "Derivative of pressure";
          input Real T_der "Derivative of temperature";
          output Real h_der "Derivative of specific enthalpy";
        algorithm
          if (aux.region == 3) then
            h_der := ((-aux.rho*aux.pd + T*aux.pt)/(aux.rho*aux.rho*aux.pd))*p_der + ((aux.rho*aux.rho*aux.pd*aux.cv + aux.T*aux.pt*aux.pt)/(aux.rho*aux.rho*aux.pd))*T_der;
          else
            h_der := (1/aux.rho - aux.T*aux.vt)*p_der + aux.cp*T_der;
          end if;
        end h_pT_der;

        function rho_pT_der "Derivative function of rho_pT"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          input Real p_der "Derivative of pressure";
          input Real T_der "Derivative of temperature";
          output Real rho_der "Derivative of density";
        algorithm
          if (aux.region == 3) then
            rho_der := (1/aux.pd)*p_der - (aux.pt/aux.pd)*T_der;
          else
            rho_der := (-aux.rho*aux.rho*aux.vp)*p_der + (-aux.rho*aux.rho*aux.vt)*T_der;
          end if;
        end rho_pT_der;

        function s_props_pT "Specific entropy as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificEntropy s "Specific entropy";
        algorithm
          s := aux.s;
          annotation(Inline = false, LateInline = true);
        end s_props_pT;

        function s_pT "Temperature as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificEntropy s "Specific entropy";
        algorithm
          s := s_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end s_pT;

        function cv_props_pT "Specific heat capacity at constant volume as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificHeatCapacity cv "Specific heat capacity";
        algorithm
          cv := aux.cv;
          annotation(Inline = false, LateInline = true);
        end cv_props_pT;

        function cv_pT "Specific heat capacity at constant volume as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificHeatCapacity cv "Specific heat capacity";
        algorithm
          cv := cv_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end cv_pT;

        function cp_props_pT "Specific heat capacity at constant pressure as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificHeatCapacity cp "Specific heat capacity";
        algorithm
          cp := if aux.region == 3 then (aux.rho*aux.rho*aux.pd*aux.cv + aux.T*aux.pt*aux.pt)/(aux.rho*aux.rho*aux.pd) else aux.cp;
          annotation(Inline = false, LateInline = true);
        end cp_props_pT;

        function cp_pT "Specific heat capacity at constant pressure as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificHeatCapacity cp "Specific heat capacity";
        algorithm
          cp := cp_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end cp_pT;

        function beta_props_pT "Isobaric expansion coefficient as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.RelativePressureCoefficient beta "Isobaric expansion coefficient";
        algorithm
          beta := if aux.region == 3 then aux.pt/(aux.rho*aux.pd) else aux.vt*aux.rho;
          annotation(Inline = false, LateInline = true);
        end beta_props_pT;

        function beta_pT "Isobaric expansion coefficient as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.RelativePressureCoefficient beta "Isobaric expansion coefficient";
        algorithm
          beta := beta_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end beta_pT;

        function kappa_props_pT "Isothermal compressibility factor as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.IsothermalCompressibility kappa "Isothermal compressibility factor";
        algorithm
          kappa := if aux.region == 3 then 1/(aux.rho*aux.pd) else -aux.vp*aux.rho;
          annotation(Inline = false, LateInline = true);
        end kappa_props_pT;

        function kappa_pT "Isothermal compressibility factor as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.IsothermalCompressibility kappa "Isothermal compressibility factor";
        algorithm
          kappa := kappa_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end kappa_pT;

        function velocityOfSound_props_pT "Speed of sound as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.Velocity v_sound "Speed of sound";
        algorithm
          v_sound := if aux.region == 3 then sqrt(max(0, (aux.pd*aux.rho*aux.rho*aux.cv + aux.pt*aux.pt*aux.T)/(aux.rho*aux.rho*aux.cv))) else sqrt(max(0, -aux.cp/(aux.rho*aux.rho*(aux.vp*aux.cp + aux.vt*aux.vt*aux.T))));
          annotation(Inline = false, LateInline = true);
        end velocityOfSound_props_pT;

        function velocityOfSound_pT "Speed of sound as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Velocity v_sound "Speed of sound";
        algorithm
          v_sound := velocityOfSound_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = true);
        end velocityOfSound_pT;

        function isentropicExponent_props_pT "Isentropic exponent as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output Real gamma "Isentropic exponent";
        algorithm
          gamma := if aux.region == 3 then 1/(aux.rho*p)*((aux.pd*aux.cv*aux.rho*aux.rho + aux.pt*aux.pt*aux.T)/(aux.cv)) else -1/(aux.rho*aux.p)*aux.cp/(aux.vp*aux.cp + aux.vt*aux.vt*aux.T);
          annotation(Inline = false, LateInline = true);
        end isentropicExponent_props_pT;

        function isentropicExponent_pT "Isentropic exponent as function of pressure and temperature"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.Temperature T "Temperature";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output Real gamma "Isentropic exponent";
        algorithm
          gamma := isentropicExponent_props_pT(p, T, waterBaseProp_pT(p, T, region));
          annotation(Inline = false, LateInline = true);
        end isentropicExponent_pT;

        function waterBaseProp_dT "Intermediate property record for water (d and T preferred states)"
          extends Modelica.Icons.Function;
          input SI.Density rho "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "Phase: 2 for two-phase, 1 for one phase, 0 if unknown";
          input Integer region = 0 "If 0, do region computation, otherwise assume the region is this input";
          output Common.IF97BaseTwoPhase aux "Auxiliary record";
        protected
          SI.SpecificEnthalpy h_liq "Liquid specific enthalpy";
          SI.Density d_liq "Liquid density";
          SI.SpecificEnthalpy h_vap "Vapour specific enthalpy";
          SI.Density d_vap "Vapour density";
          Common.GibbsDerivs g "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Common.HelmholtzDerivs f "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Modelica.Media.Common.PhaseBoundaryProperties liq "Phase boundary property record";
          Modelica.Media.Common.PhaseBoundaryProperties vap "Phase boundary property record";
          Modelica.Media.Common.GibbsDerivs gl "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Modelica.Media.Common.GibbsDerivs gv "Dimensionless Gibbs function and derivatives w.r.t. pi and tau";
          Modelica.Media.Common.HelmholtzDerivs fl "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Modelica.Media.Common.HelmholtzDerivs fv "Dimensionless Helmholtz function and derivatives w.r.t. delta and tau";
          Integer error "Error flag for inverse iterations";
        algorithm
          aux.region := if region == 0 then (if phase == 2 then 4 else BaseIF97.Regions.region_dT(d = rho, T = T, phase = phase)) else region;
          aux.phase := if aux.region == 4 then 2 else 1;
          aux.R_s := BaseIF97.data.RH2O;
          aux.rho := rho;
          aux.T := T;
          aux.vt := 0.0 "Initialized in case it is not needed";
          aux.vp := 0.0 "Initialized in case it is not needed";
          if (aux.region == 1) then
            (aux.p, error) := BaseIF97.Inverses.pofdt125(d = rho, T = T, reldd = 1.0e-8, region = 1);
            g := BaseIF97.Basic.g1(aux.p, T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := aux.p/(aux.R_s*T*g.pi*g.gpi);
            aux.vt := aux.R_s/aux.p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*T/(aux.p*aux.p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 0.0;
          elseif (aux.region == 2) then
            (aux.p, error) := BaseIF97.Inverses.pofdt125(d = rho, T = T, reldd = 1.0e-8, region = 2);
            g := BaseIF97.Basic.g2(aux.p, T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := aux.p/(aux.R_s*T*g.pi*g.gpi);
            aux.vt := aux.R_s/aux.p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*T/(aux.p*aux.p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
            aux.x := 1.0;
          elseif (aux.region == 3) then
            f := BaseIF97.Basic.f3(rho, T);
            aux.p := aux.R_s*rho*T*f.delta*f.fdelta;
            aux.h := aux.R_s*T*(f.tau*f.ftau + f.delta*f.fdelta);
            aux.s := aux.R_s*(f.tau*f.ftau - f.f);
            aux.pd := aux.R_s*T*f.delta*(2.0*f.fdelta + f.delta*f.fdeltadelta);
            aux.pt := aux.R_s*rho*f.delta*(f.fdelta - f.tau*f.fdeltatau);
            aux.cv := aux.R_s*(-f.tau*f.tau*f.ftautau);
            aux.cp := (aux.rho*aux.rho*aux.pd*aux.cv + aux.T*aux.pt*aux.pt)/(aux.rho*aux.rho*aux.pd);
            aux.x := 0.0;
          elseif (aux.region == 4) then
            aux.p := BaseIF97.Basic.psat(T);
            d_liq := rhol_T(T);
            d_vap := rhov_T(T);
            h_liq := hl_p(aux.p);
            h_vap := hv_p(aux.p);
            aux.x := if (d_vap <> d_liq) then (1/rho - 1/d_liq)/(1/d_vap - 1/d_liq) else 1.0;
            aux.h := h_liq + aux.x*(h_vap - h_liq);
            if T < BaseIF97.data.TLIMIT1 then
              gl := BaseIF97.Basic.g1(aux.p, T);
              gv := BaseIF97.Basic.g2(aux.p, T);
              liq := Common.gibbsToBoundaryProps(gl);
              vap := Common.gibbsToBoundaryProps(gv);
            else
              fl := BaseIF97.Basic.f3(d_liq, T);
              fv := BaseIF97.Basic.f3(d_vap, T);
              liq := Common.helmholtzToBoundaryProps(fl);
              vap := Common.helmholtzToBoundaryProps(fv);
            end if;
            aux.dpT := if (liq.d <> vap.d) then (vap.s - liq.s)*liq.d*vap.d/(liq.d - vap.d) else BaseIF97.Basic.dptofT(aux.T);
            aux.s := liq.s + aux.x*(vap.s - liq.s);
            aux.cv := Common.cv2Phase(liq, vap, aux.x, aux.T, aux.p);
            aux.cp := liq.cp + aux.x*(vap.cp - liq.cp);
            aux.pt := liq.pt + aux.x*(vap.pt - liq.pt);
            aux.pd := liq.pd + aux.x*(vap.pd - liq.pd);
          elseif (aux.region == 5) then
            (aux.p, error) := BaseIF97.Inverses.pofdt125(d = rho, T = T, reldd = 1.0e-8, region = 5);
            g := BaseIF97.Basic.g2(aux.p, T);
            aux.h := aux.R_s*aux.T*g.tau*g.gtau;
            aux.s := aux.R_s*(g.tau*g.gtau - g.g);
            aux.rho := aux.p/(aux.R_s*T*g.pi*g.gpi);
            aux.vt := aux.R_s/aux.p*(g.pi*g.gpi - g.tau*g.pi*g.gtaupi);
            aux.vp := aux.R_s*T/(aux.p*aux.p)*g.pi*g.pi*g.gpipi;
            aux.pt := -g.p/g.T*(g.gpi - g.tau*g.gtaupi)/(g.gpipi*g.pi);
            aux.pd := -g.R_s*g.T*g.gpi*g.gpi/(g.gpipi);
            aux.cp := -aux.R_s*g.tau*g.tau*g.gtautau;
            aux.cv := aux.R_s*(-g.tau*g.tau*g.gtautau + ((g.gpi - g.tau*g.gtaupi)*(g.gpi - g.tau*g.gtaupi)/g.gpipi));
          else
            assert(false, "Error in region computation of IF97 steam tables" + "(rho = " + String(rho) + ", T = " + String(T) + ")");
          end if;
        end waterBaseProp_dT;

        function h_props_dT "Specific enthalpy as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := aux.h;
          annotation(derivative(noDerivative = aux) = h_dT_der, Inline = false, LateInline = true);
        end h_props_dT;

        function h_dT "Specific enthalpy as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := h_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end h_dT;

        function h_dT_der "Derivative function of h_dT"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          input Real d_der "Derivative of density";
          input Real T_der "Derivative of temperature";
          output Real h_der "Derivative of specific enthalpy";
        algorithm
          if (aux.region == 3) then
            h_der := ((-d*aux.pd + T*aux.pt)/(d*d))*d_der + ((aux.cv*d + aux.pt)/d)*T_der;
          elseif (aux.region == 4) then
            h_der := T*aux.dpT/(d*d)*d_der + ((aux.cv*d + aux.dpT)/d)*T_der;
          else
            h_der := (-(-1/d + T*aux.vt)/(d*d*aux.vp))*d_der + ((aux.vp*aux.cp - aux.vt/d + T*aux.vt*aux.vt)/aux.vp)*T_der;
          end if;
        end h_dT_der;

        function p_props_dT "Pressure as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.Pressure p "Pressure";
        algorithm
          p := aux.p;
          annotation(derivative(noDerivative = aux) = p_dT_der, Inline = false, LateInline = true);
        end p_props_dT;

        function p_dT "Pressure as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Pressure p "Pressure";
        algorithm
          p := p_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end p_dT;

        function p_dT_der "Derivative function of p_dT"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          input Real d_der "Derivative of density";
          input Real T_der "Derivative of temperature";
          output Real p_der "Derivative of pressure";
        algorithm
          if (aux.region == 3) then
            p_der := aux.pd*d_der + aux.pt*T_der;
          elseif (aux.region == 4) then
            p_der := aux.dpT*T_der;
          else
            p_der := (-1/(d*d*aux.vp))*d_der + (-aux.vt/aux.vp)*T_der;
          end if;
        end p_dT_der;

        function s_props_dT "Specific entropy as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificEntropy s "Specific entropy";
        algorithm
          s := aux.s;
          annotation(Inline = false, LateInline = true);
        end s_props_dT;

        function s_dT "Temperature as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificEntropy s "Specific entropy";
        algorithm
          s := s_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end s_dT;

        function cv_props_dT "Specific heat capacity at constant volume as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificHeatCapacity cv "Specific heat capacity";
        algorithm
          cv := aux.cv;
          annotation(Inline = false, LateInline = true);
        end cv_props_dT;

        function cv_dT "Specific heat capacity at constant volume as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificHeatCapacity cv "Specific heat capacity";
        algorithm
          cv := cv_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end cv_dT;

        function cp_props_dT "Specific heat capacity at constant pressure as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificHeatCapacity cp "Specific heat capacity";
        algorithm
          cp := aux.cp;
          annotation(Inline = false, LateInline = true);
        end cp_props_dT;

        function cp_dT "Specific heat capacity at constant pressure as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificHeatCapacity cp "Specific heat capacity";
        algorithm
          cp := cp_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end cp_dT;

        function beta_props_dT "Isobaric expansion coefficient as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.RelativePressureCoefficient beta "Isobaric expansion coefficient";
        algorithm
          beta := if aux.region == 3 or aux.region == 4 then aux.pt/(aux.rho*aux.pd) else aux.vt*aux.rho;
          annotation(Inline = false, LateInline = true);
        end beta_props_dT;

        function beta_dT "Isobaric expansion coefficient as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.RelativePressureCoefficient beta "Isobaric expansion coefficient";
        algorithm
          beta := beta_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end beta_dT;

        function kappa_props_dT "Isothermal compressibility factor as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.IsothermalCompressibility kappa "Isothermal compressibility factor";
        algorithm
          kappa := if aux.region == 3 or aux.region == 4 then 1/(aux.rho*aux.pd) else -aux.vp*aux.rho;
          annotation(Inline = false, LateInline = true);
        end kappa_props_dT;

        function kappa_dT "Isothermal compressibility factor as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.IsothermalCompressibility kappa "Isothermal compressibility factor";
        algorithm
          kappa := kappa_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end kappa_dT;

        function velocityOfSound_props_dT "Speed of sound as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.Velocity v_sound "Speed of sound";
        algorithm
          v_sound := if aux.region == 3 then sqrt(max(0, ((aux.pd*aux.rho*aux.rho*aux.cv + aux.pt*aux.pt*aux.T)/(aux.rho*aux.rho*aux.cv)))) else if aux.region == 4 then sqrt(max(0, 1/((aux.rho*(aux.rho*aux.cv/aux.dpT + 1.0)/(aux.dpT*aux.T)) - 1/aux.rho*aux.rho*aux.rho/(aux.dpT*aux.T)))) else sqrt(max(0, -aux.cp/(aux.rho*aux.rho*(aux.vp*aux.cp + aux.vt*aux.vt*aux.T))));
          annotation(Inline = false, LateInline = true);
        end velocityOfSound_props_dT;

        function velocityOfSound_dT "Speed of sound as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.Velocity v_sound "Speed of sound";
        algorithm
          v_sound := velocityOfSound_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = true);
        end velocityOfSound_dT;

        function isentropicExponent_props_dT "Isentropic exponent as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output Real gamma "Isentropic exponent";
        algorithm
          gamma := if aux.region == 3 then 1/(aux.rho*aux.p)*((aux.pd*aux.cv*aux.rho*aux.rho + aux.pt*aux.pt*aux.T)/(aux.cv)) else if aux.region == 4 then 1/(aux.rho*aux.p)*aux.dpT*aux.dpT*aux.T/aux.cv else -1/(aux.rho*aux.p)*aux.cp/(aux.vp*aux.cp + aux.vt*aux.vt*aux.T);
          annotation(Inline = false, LateInline = true);
        end isentropicExponent_props_dT;

        function isentropicExponent_dT "Isentropic exponent as function of density and temperature"
          extends Modelica.Icons.Function;
          input SI.Density d "Density";
          input SI.Temperature T "Temperature";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output Real gamma "Isentropic exponent";
        algorithm
          gamma := isentropicExponent_props_dT(d, T, waterBaseProp_dT(d, T, phase, region));
          annotation(Inline = false, LateInline = true);
        end isentropicExponent_dT;

        function hl_p = BaseIF97.Regions.hl_p "Compute the saturated liquid specific h(p)";
        function hv_p = BaseIF97.Regions.hv_p "Compute the saturated vapour specific h(p)";
        function rhol_T = BaseIF97.Regions.rhol_T "Compute the saturated liquid d(T)";
        function rhov_T = BaseIF97.Regions.rhov_T "Compute the saturated vapour d(T)";
        function dynamicViscosity = BaseIF97.Transport.visc_dTp "Compute eta(d,T) in the one-phase region";
        function thermalConductivity = BaseIF97.Transport.cond_dTp "Compute lambda(d,T,p) in the one-phase region";
        function surfaceTension = BaseIF97.Transport.surfaceTension "Compute sigma(T) at saturation T";

        function isentropicEnthalpy "Isentropic specific enthalpy from p,s (preferably use dynamicIsentropicEnthalpy in dynamic simulation!)"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
          input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
          output SI.SpecificEnthalpy h "Specific enthalpy";
        algorithm
          h := isentropicEnthalpy_props(p, s, waterBaseProp_ps(p, s, phase, region));
          annotation(Inline = true);
        end isentropicEnthalpy;

        function isentropicEnthalpy_props
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          output SI.SpecificEnthalpy h "Isentropic enthalpy";
        algorithm
          h := aux.h;
          annotation(derivative(noDerivative = aux) = isentropicEnthalpy_der, Inline = false, LateInline = true);
        end isentropicEnthalpy_props;

        function isentropicEnthalpy_der "Derivative of isentropic specific enthalpy from p,s"
          extends Modelica.Icons.Function;
          input SI.Pressure p "Pressure";
          input SI.SpecificEntropy s "Specific entropy";
          input Common.IF97BaseTwoPhase aux "Auxiliary record";
          input Real p_der "Pressure derivative";
          input Real s_der "Entropy derivative";
          output Real h_der "Specific enthalpy derivative";
        algorithm
          h_der := 1/aux.rho*p_der + aux.T*s_der;
          annotation(Inline = true);
        end isentropicEnthalpy_der;
      end IF97_Utilities;
    end Water;
  end Media;

  package Thermal "Library of thermal system components to model heat transfer and simple thermo-fluid pipe flow"
    extends Modelica.Icons.Package;
    import Modelica.Units.SI;

    package HeatTransfer "Library of 1-dimensional heat transfer with lumped elements"
      extends Modelica.Icons.Package;

      package Sources "Thermal sources"
        extends Modelica.Icons.SourcesPackage;

        model PrescribedHeatFlow "Prescribed heat flow boundary condition"
          parameter SI.Temperature T_ref = 293.15 "Reference temperature";
          parameter SI.LinearTemperatureCoefficient alpha = 0 "Temperature coefficient of heat flow rate";
          Modelica.Blocks.Interfaces.RealInput Q_flow(unit = "W");
          Interfaces.HeatPort_b port;
        equation
          port.Q_flow = -Q_flow*(1 + alpha*(port.T - T_ref));
        end PrescribedHeatFlow;
      end Sources;

      package Celsius "Components with Celsius input and/or output"
        extends Modelica.Icons.VariantsPackage;

        model FromKelvin "Conversion from Kelvin to degree Celsius"
          extends HeatTransfer.Icons.Conversion;
          Modelica.Blocks.Interfaces.RealInput Kelvin(unit = "K");
          Modelica.Blocks.Interfaces.RealOutput Celsius(unit = "degC");
        equation
          Celsius = Modelica.Units.Conversions.to_degC(Kelvin);
        end FromKelvin;
      end Celsius;

      package Interfaces "Connectors and partial models"
        extends Modelica.Icons.InterfacesPackage;

        partial connector HeatPort "Thermal port for 1-dim. heat transfer"
          SI.Temperature T "Port temperature";
          flow SI.HeatFlowRate Q_flow "Heat flow rate (positive if flowing from outside into the component)";
        end HeatPort;

        connector HeatPort_a "Thermal port for 1-dim. heat transfer (filled rectangular icon)"
          extends HeatPort;
        end HeatPort_a;

        connector HeatPort_b "Thermal port for 1-dim. heat transfer (unfilled rectangular icon)"
          extends HeatPort;
        end HeatPort_b;
      end Interfaces;

      package Icons "Icons"
        extends Modelica.Icons.IconsPackage;

        model Conversion "Conversion of temperatures" end Conversion;
      end Icons;
    end HeatTransfer;
  end Thermal;

  package Math "Library of mathematical functions (e.g., sin, cos) and of functions operating on vectors and matrices"
    extends Modelica.Icons.Package;

    package Icons "Icons for Math"
      extends Modelica.Icons.IconsPackage;

      partial function AxisLeft "Basic icon for mathematical function with y-axis on left side" end AxisLeft;

      partial function AxisCenter "Basic icon for mathematical function with y-axis in the center" end AxisCenter;
    end Icons;

    function asin "Inverse sine (-1 <= u <= 1)"
      extends Modelica.Math.Icons.AxisCenter;
      input Real u "Independent variable";
      output Modelica.Units.SI.Angle y "Dependent variable y=asin(u)";
    algorithm
      y := .asin(u);
      annotation(Inline = true);
    end asin;

    function acos "Inverse cosine (-1 <= u <= 1)"
      extends Modelica.Math.Icons.AxisCenter;
      input Real u "Independent variable";
      output Modelica.Units.SI.Angle y "Dependent variable y=acos(u)";
    algorithm
      y := .acos(u);
      annotation(Inline = true);
    end acos;

    function exp "Exponential, base e"
      extends Modelica.Math.Icons.AxisCenter;
      input Real u "Independent variable";
      output Real y "Dependent variable y=exp(u)";
    algorithm
      y := .exp(u);
      annotation(Inline = true);
    end exp;

    function log "Natural (base e) logarithm (u shall be > 0)"
      extends Modelica.Math.Icons.AxisLeft;
      input Real u "Independent variable";
      output Real y "Dependent variable y=ln(u)";
    algorithm
      y := .log(u);
      annotation(Inline = true);
    end log;
  end Math;

  package Utilities "Library of utility functions dedicated to scripting (operating on files, streams, strings, system)"
    extends Modelica.Icons.UtilitiesPackage;

    package Streams "Read from files and write to files"
      extends Modelica.Icons.FunctionsPackage;

      pure function error "Print error message and cancel all actions - in case of an unrecoverable error"
        extends Modelica.Icons.Function;
        input String string "String to be printed to error message window";
      algorithm
        assert(false, string);
      end error;
    end Streams;
  end Utilities;

  package Constants "Library of mathematical constants and constants of nature (e.g., pi, eps, R, sigma)"
    extends Modelica.Icons.Package;
    import Modelica.Units.SI;
    import Modelica.Units.NonSI;
    final constant Real pi = 2*Modelica.Math.asin(1.0);
    final constant Real eps = ModelicaServices.Machine.eps "The difference between 1 and the least value greater than 1 that is representable in the given floating point type";
    final constant Real small = ModelicaServices.Machine.small "Minimum normalized positive floating-point number";
    final constant Real inf = ModelicaServices.Machine.inf "Maximum representable finite floating-point number";
    final constant SI.Velocity c = 299792458 "Speed of light in vacuum";
    final constant SI.Acceleration g_n = 9.80665 "Standard acceleration of gravity on earth";
    final constant SI.ElectricCharge q = 1.602176634e-19 "Elementary charge";
    final constant Real h(final unit = "J.s") = 6.62607015e-34 "Planck constant";
    final constant Real k(final unit = "J/K") = 1.380649e-23 "Boltzmann constant";
    final constant Real R(final unit = "J/(mol.K)") = k*N_A "Molar gas constant";
    final constant Real N_A(final unit = "1/mol") = 6.02214076e23 "Avogadro constant";
    final constant SI.Permeability mu_0 = 1.25663706212e-6 "Magnetic constant";
    final constant NonSI.Temperature_degC T_zero = -273.15 "Absolute zero temperature";
  end Constants;

  package Icons "Library of icons"
    extends Icons.Package;

    partial package ExamplesPackage "Icon for packages containing runnable examples"
      extends Modelica.Icons.Package;
    end ExamplesPackage;

    partial model Example "Icon for runnable examples" end Example;

    partial package Package "Icon for standard packages" end Package;

    partial package BasesPackage "Icon for packages containing base classes"
      extends Modelica.Icons.Package;
    end BasesPackage;

    partial package VariantsPackage "Icon for package containing variants"
      extends Modelica.Icons.Package;
    end VariantsPackage;

    partial package InterfacesPackage "Icon for packages containing interfaces"
      extends Modelica.Icons.Package;
    end InterfacesPackage;

    partial package SourcesPackage "Icon for packages containing sources"
      extends Modelica.Icons.Package;
    end SourcesPackage;

    partial package SensorsPackage "Icon for packages containing sensors"
      extends Modelica.Icons.Package;
    end SensorsPackage;

    partial package UtilitiesPackage "Icon for utility packages"
      extends Modelica.Icons.Package;
    end UtilitiesPackage;

    partial package TypesPackage "Icon for packages containing type definitions"
      extends Modelica.Icons.Package;
    end TypesPackage;

    partial package FunctionsPackage "Icon for packages containing functions"
      extends Modelica.Icons.Package;
    end FunctionsPackage;

    partial package IconsPackage "Icon for packages containing icons"
      extends Modelica.Icons.Package;
    end IconsPackage;

    partial package MaterialPropertiesPackage "Icon for package containing property classes"
      extends Modelica.Icons.Package;
    end MaterialPropertiesPackage;

    partial class RoundSensor "Icon representing a round measurement device" end RoundSensor;

    partial function Function "Icon for functions" end Function;

    partial record Record "Icon for records" end Record;

    type TypeReal "Icon for Real types"
      extends Real;
    end TypeReal;
  end Icons;

  package Units "Library of type and unit definitions"
    extends Modelica.Icons.Package;

    package SI "Library of SI unit definitions"
      extends Modelica.Icons.Package;
      type Angle = Real(final quantity = "Angle", final unit = "rad", displayUnit = "deg");
      type Area = Real(final quantity = "Area", final unit = "m2");
      type Volume = Real(final quantity = "Volume", final unit = "m3");
      type Time = Real(final quantity = "Time", final unit = "s");
      type Velocity = Real(final quantity = "Velocity", final unit = "m/s");
      type Acceleration = Real(final quantity = "Acceleration", final unit = "m/s2");
      type Mass = Real(quantity = "Mass", final unit = "kg", min = 0);
      type Density = Real(final quantity = "Density", final unit = "kg/m3", displayUnit = "g/cm3", min = 0.0);
      type SpecificVolume = Real(final quantity = "SpecificVolume", final unit = "m3/kg", min = 0.0);
      type Pressure = Real(final quantity = "Pressure", final unit = "Pa", displayUnit = "bar");
      type AbsolutePressure = Pressure(min = 0.0, nominal = 1e5);
      type PressureSlope = Real(final quantity = "PressureSlope", final unit = "Pa/s", displayUnit = "bar/s");
      type DynamicViscosity = Real(final quantity = "DynamicViscosity", final unit = "Pa.s", min = 0);
      type SurfaceTension = Real(final quantity = "SurfaceTension", final unit = "N/m");
      type Energy = Real(final quantity = "Energy", final unit = "J");
      type Power = Real(final quantity = "Power", final unit = "W");
      type MassFlowRate = Real(quantity = "MassFlowRate", final unit = "kg/s");
      type VolumeFlowRate = Real(final quantity = "VolumeFlowRate", final unit = "m3/s");
      type MomentumFlux = Real(final quantity = "MomentumFlux", final unit = "N");
      type ThermodynamicTemperature = Real(final quantity = "ThermodynamicTemperature", final unit = "K", min = 0.0, start = 288.15, nominal = 300, displayUnit = "degC") "Absolute temperature (use type TemperatureDifference for relative temperatures)" annotation(absoluteValue = true);
      type Temperature = ThermodynamicTemperature;
      type TemperatureSlope = Real(final quantity = "TemperatureSlope", final unit = "K/s");
      type LinearTemperatureCoefficient = Real(final quantity = "LinearTemperatureCoefficient", final unit = "1/K");
      type RelativePressureCoefficient = Real(final quantity = "RelativePressureCoefficient", final unit = "1/K");
      type Compressibility = Real(final quantity = "Compressibility", final unit = "1/Pa");
      type IsothermalCompressibility = Compressibility;
      type HeatFlowRate = Real(final quantity = "Power", final unit = "W");
      type ThermalConductivity = Real(final quantity = "ThermalConductivity", final unit = "W/(m.K)");
      type SpecificHeatCapacity = Real(final quantity = "SpecificHeatCapacity", final unit = "J/(kg.K)");
      type RatioOfSpecificHeatCapacities = Real(final quantity = "RatioOfSpecificHeatCapacities", final unit = "1");
      type Entropy = Real(final quantity = "Entropy", final unit = "J/K");
      type SpecificEntropy = Real(final quantity = "SpecificEntropy", final unit = "J/(kg.K)");
      type SpecificEnergy = Real(final quantity = "SpecificEnergy", final unit = "J/kg");
      type SpecificEnthalpy = SpecificEnergy;
      type DerDensityByEnthalpy = Real(final unit = "kg.s2/m5");
      type DerDensityByPressure = Real(final unit = "s2/m2");
      type DerEnthalpyByPressure = Real(final unit = "J.m.s2/kg2");
      type ElectricCharge = Real(final quantity = "ElectricCharge", final unit = "C");
      type Permeability = Real(final quantity = "Permeability", final unit = "V.s/(A.m)");
      type AmountOfSubstance = Real(final quantity = "AmountOfSubstance", final unit = "mol", min = 0);
      type MolarMass = Real(final quantity = "MolarMass", final unit = "kg/mol", min = 0);
      type MolarVolume = Real(final quantity = "MolarVolume", final unit = "m3/mol", min = 0);
      type MassFraction = Real(final quantity = "MassFraction", final unit = "1", min = 0, max = 1);
      type MoleFraction = Real(final quantity = "MoleFraction", final unit = "1", min = 0, max = 1);
      type FaradayConstant = Real(final quantity = "FaradayConstant", final unit = "C/mol");
    end SI;

    package NonSI "Type definitions of non SI and other units"
      extends Modelica.Icons.Package;
      type Temperature_degC = Real(final quantity = "ThermodynamicTemperature", final unit = "degC") "Absolute temperature in degree Celsius (for relative temperature use Modelica.Units.SI.TemperatureDifference)" annotation(absoluteValue = true);
      type Pressure_bar = Real(final quantity = "Pressure", final unit = "bar") "Absolute pressure in bar";
    end NonSI;

    package Conversions "Conversion functions to/from non SI units and type definitions of non SI units"
      extends Modelica.Icons.Package;

      function to_degC "Convert from kelvin to degree Celsius"
        extends Modelica.Units.Icons.Conversion;
        input SI.Temperature Kelvin "Value in kelvin";
        output Modelica.Units.NonSI.Temperature_degC Celsius "Value in degree Celsius";
      algorithm
        Celsius := Kelvin + Modelica.Constants.T_zero;
        annotation(Inline = true);
      end to_degC;

      function from_degC "Convert from degree Celsius to kelvin"
        extends Modelica.Units.Icons.Conversion;
        input Modelica.Units.NonSI.Temperature_degC Celsius "Value in degree Celsius";
        output SI.Temperature Kelvin "Value in kelvin";
      algorithm
        Kelvin := Celsius - Modelica.Constants.T_zero;
        annotation(Inline = true);
      end from_degC;

      function to_bar "Convert from Pascal to bar"
        extends Modelica.Units.Icons.Conversion;
        input SI.Pressure Pa "Value in Pascal";
        output Modelica.Units.NonSI.Pressure_bar bar "Value in bar";
      algorithm
        bar := Pa/1e5;
        annotation(Inline = true);
      end to_bar;

      function from_bar "Convert from bar to Pascal"
        extends Modelica.Units.Icons.Conversion;
        input Modelica.Units.NonSI.Pressure_bar bar "Value in bar";
        output SI.Pressure Pa "Value in Pascal";
      algorithm
        Pa := 1e5*bar;
        annotation(Inline = true);
      end from_bar;
    end Conversions;

    package Icons "Icons for Units"
      extends Modelica.Icons.IconsPackage;

      partial function Conversion "Base icon for conversion functions" end Conversion;
    end Icons;
  end Units;
  annotation(version = "4.1.0", versionDate = "2025-05-23", dateModified = "2025-05-23 15:00:00Z");
end Modelica;

model DrumBoiler_total  "Complete drum boiler model, including evaporator and supplementary components"
  extends Modelica.Fluid.Examples.DrumBoiler.DrumBoiler;
 annotation(experiment(StopTime = 5400));
end DrumBoiler_total;
